import { useCallback, useEffect, useRef, useState } from 'react';
import browser from 'webextension-polyfill';
import { getAllItems, updateItemStatus, initDB, snoozeItem } from '../db';
import type { ShadowCartItem } from '../types';
import { getAffiliateUrl } from '../utils';
import { CartItem } from './components/CartItem';
import { Dashboard } from './components/Dashboard';
import { ManualAddModal } from './components/ManualAddModal';
import { SnoozeModal } from './components/SnoozeModal';

type Tab = 'pending' | 'history' | 'dashboard';
type Filter = 'all' | 'bought' | 'dropped';

interface UndoEntry { id: string; name: string; timer: ReturnType<typeof setTimeout> }

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [historyFilter, setHistoryFilter] = useState<Filter>('all');
  const [historySearch, setHistorySearch] = useState('');
  const [items, setItems] = useState<ShadowCartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [undoQueue, setUndoQueue] = useState<UndoEntry[]>([]);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [snoozeTarget, setSnoozeTarget] = useState<{ id: string; name: string; reminderEmail?: string } | null>(null);
  const loadCounterRef = useRef(0);

  const loadItems = useCallback(async (showLoading = true) => {
    loadCounterRef.current += 1;
    const loadId = loadCounterRef.current;
    if (showLoading) setLoading(true);
    try {
      setLoadError('');
      await initDB();
      const data = await getAllItems();
      data.sort((a, b) => b.addedAt - a.addedAt);
      if (loadCounterRef.current === loadId) {
        setItems(data);
      }
      // Refresh badge count in background
      browser.runtime.sendMessage({ type: 'REFRESH_BADGE' }).catch(() => {});
    } catch {
      if (loadCounterRef.current === loadId) {
        setLoadError('Could not load ShadowCart items. Storage may be unavailable or full.');
      }
    } finally {
      if (loadCounterRef.current === loadId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line
    void loadItems(false);
  }, [loadItems]);

  // Keyboard shortcuts: B = buy first, D = drop first, H = history, P = pending, S = dashboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'p') setActiveTab('pending');
      if (e.key === 'h') setActiveTab('history');
      if (e.key === 's') setActiveTab('dashboard');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleBuy = async (id: string, url: string) => {
    await updateItemStatus(id, 'bought');
    browser.tabs.create({ url: getAffiliateUrl(url) });
    await loadItems(false);
  };

  const handleDrop = async (id: string, name: string) => {
    // Optimistically remove from UI
    setItems(prev => prev.filter(i => i.id !== id));
    await updateItemStatus(id, 'dropped');

    const timer = setTimeout(() => {
      setUndoQueue(prev => prev.filter(q => q.id !== id));
    }, 5000);

    setUndoQueue(prev => [...prev, { id, name, timer }]);
  };

  const handleUndo = async (id: string) => {
    const entry = undoQueue.find(q => q.id === id);
    if (entry) clearTimeout(entry.timer);
    setUndoQueue(prev => prev.filter(q => q.id !== id));
    await updateItemStatus(id, 'pending', { resetReminder: true });
    await loadItems(false);
  };

  const handleSnooze = (id: string) => {
    const item = items.find(i => i.id === id);
    if (item) setSnoozeTarget({ id, name: item.name, reminderEmail: item.reminderEmail });
  };

  const confirmSnooze = async (remindAt: number, email?: string) => {
    if (!snoozeTarget) return;
    await snoozeItem(snoozeTarget.id, remindAt, email);
    setSnoozeTarget(null);
    await loadItems(false);
  };

  const pendingItems = items.filter(i => i.status === 'pending');
  const historyItems = items.filter(i =>
    i.status !== 'pending' &&
    (historyFilter === 'all' || i.status === historyFilter) &&
    (historySearch === '' ||
      i.name.toLowerCase().includes(historySearch.toLowerCase()) ||
      (i.siteName || '').toLowerCase().includes(historySearch.toLowerCase()))
  );

  const tabs: Tab[] = ['pending', 'history', 'dashboard'];
  const tabLabels: Record<Tab, string> = { pending: 'Pending', history: 'History', dashboard: 'Insights' };

  return (
    <div className="flex flex-col h-full bg-[#0f0f0f] text-white relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">👻</span>
          <span className="text-sm font-semibold text-white">ShadowCart</span>
          {pendingItems.length > 0 && (
            <span className="text-[10px] bg-[#6c63ff] text-white px-1.5 py-0.5 rounded-full font-bold">{pendingItems.length}</span>
          )}
        </div>
        <button
          onClick={() => setShowManualAdd(true)}
          title="Add item manually"
          className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#1a1a1a] hover:bg-[#6c63ff] border border-[#2e2e2e] hover:border-[#6c63ff] text-[#888] hover:text-white transition-all text-sm"
        >
          +
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1e1e1e] mt-2 px-3 shrink-0">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 pb-2.5 text-xs font-medium transition-colors relative ${
              activeTab === tab ? 'text-[#6c63ff]' : 'text-[#555] hover:text-[#888]'
            }`}
          >
            {tabLabels[tab]}
            {activeTab === tab && <div className="absolute bottom-0 left-0 w-full h-[2px] bg-[#6c63ff] rounded-t-sm" />}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {loading ? (
          <div className="flex justify-center items-center h-full text-[#444] text-sm">Loading...</div>
        ) : (
          <>
            {loadError && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2 text-xs">
                {loadError}
              </div>
            )}

            {/* PENDING TAB */}
            {activeTab === 'pending' && (
              <>
                {pendingItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                    <div className="text-4xl mb-4">👻</div>
                    <p className="text-sm text-[#555]">ShadowCart is empty.<br />Add items while shopping!</p>
                    <button
                      onClick={() => setShowManualAdd(true)}
                      className="mt-4 px-4 py-2 bg-[#1a1a1a] hover:bg-[#6c63ff] border border-[#2e2e2e] hover:border-[#6c63ff] rounded-lg text-xs text-[#888] hover:text-white transition-all"
                    >
                      + Add manually
                    </button>
                  </div>
                ) : (
                  pendingItems.map(item => (
                    <CartItem
                      key={item.id}
                      item={item}
                      onBuy={handleBuy}
                      onDrop={handleDrop}
                      onSnooze={handleSnooze}
                    />
                  ))
                )}
              </>
            )}

            {/* HISTORY TAB */}
            {activeTab === 'history' && (
              <>
                <div className="flex gap-2 shrink-0">
                  <input
                    type="text"
                    placeholder="Search..."
                    value={historySearch}
                    onChange={e => setHistorySearch(e.target.value)}
                    className="flex-1 bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#444] focus:outline-none focus:border-[#6c63ff] transition-colors"
                  />
                  <div className="flex bg-[#1a1a1a] border border-[#2e2e2e] rounded-lg overflow-hidden">
                    {(['all', 'bought', 'dropped'] as Filter[]).map(f => (
                      <button
                        key={f}
                        onClick={() => setHistoryFilter(f)}
                        className={`px-2.5 py-1.5 text-xs capitalize transition-colors ${
                          historyFilter === f ? 'bg-[#2a2a2a] text-white' : 'text-[#555] hover:text-[#888]'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
                {historyItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32">
                    <p className="text-sm text-[#555]">No items found.</p>
                  </div>
                ) : (
                  historyItems.map(item => (
                    <CartItem key={item.id} item={item} isHistory />
                  ))
                )}
              </>
            )}

            {/* DASHBOARD TAB */}
            {activeTab === 'dashboard' && <Dashboard items={items} />}
          </>
        )}
      </div>

      {/* Undo Toast Stack */}
      {undoQueue.length > 0 && (
        <div className="absolute bottom-2 left-3 right-3 flex flex-col gap-1.5 z-40">
          {undoQueue.map(entry => (
            <div key={entry.id} className="flex items-center justify-between bg-[#2a2a2a] border border-[#3a3a3a] rounded-xl px-3 py-2">
              <p className="text-xs text-[#aaa] truncate flex-1 mr-2">Dropped: <span className="text-white">{entry.name}</span></p>
              <button
                onClick={() => handleUndo(entry.id)}
                className="text-[#6c63ff] text-xs font-semibold hover:text-white shrink-0 transition-colors"
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Manual Add Modal */}
      {showManualAdd && (
        <ManualAddModal
          onClose={() => setShowManualAdd(false)}
          onAdded={() => loadItems(false)}
        />
      )}

      {/* Snooze Modal */}
      {snoozeTarget && (
        <SnoozeModal
          itemName={snoozeTarget.name}
          initialEmail={snoozeTarget.reminderEmail}
          onConfirm={confirmSnooze}
          onClose={() => setSnoozeTarget(null)}
        />
      )}
    </div>
  );
}
