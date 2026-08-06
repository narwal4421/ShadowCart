import { useMemo, useState, useEffect } from 'react';
import type { ShadowCartItem, MoodTag, UserSettings } from '../../types';
import { MoodTag as MoodTagBadge } from './MoodTag';
import { exportToCSV } from '../../utils';
import { getSettings, updateSettings } from '../../db';

// ---------- SVG Donut Chart ----------
const MOOD_COLORS: Record<MoodTag, string> = {
  bored: '#6b7280',
  stressed: '#ef4444',
  genuinely_need: '#22c55e',
  treating_myself: '#a855f7',
  saw_it_somewhere: '#3b82f6',
  untagged: '#374151',
};

function DonutChart({ segments }: { segments: Array<{ value: number; color: string }> }) {
  const total = segments.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="w-20 h-20 rounded-full bg-[#2a2a2a]" />;
  const r = 30; const cx = 40; const cy = 40;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#2a2a2a" strokeWidth="14" />
      {segments.map((seg, i) => {
        const offset = segments.slice(0, i).reduce((sum, item) => sum + item.value, 0);
        const dash = (seg.value / total) * circ;
        const rot = (offset / total) * 360 - 90;
        return (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color} strokeWidth="14"
            strokeDasharray={`${dash} ${circ - dash}`}
            transform={`rotate(${rot} ${cx} ${cy})`}
          />
        );
      })}
      <circle cx={cx} cy={cy} r="22" fill="#1a1a1a" />
    </svg>
  );
}

// ---------- 7-Day Bar Chart ----------
function WeekChart({ items }: { items: ShadowCartItem[] }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });
  const counts = days.map(start => items.filter(it => it.addedAt >= start && it.addedAt < start + 86400000).length);
  const max = Math.max(...counts, 1);
  const labels = days.map(d => new Date(d).toLocaleDateString('en', { weekday: 'short' }).slice(0, 2));

  return (
    <div className="flex items-end gap-1 h-14 w-full pt-1">
      {counts.map((c, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div
            className="w-full rounded-t-sm bg-[#6c63ff]/70 transition-all"
            style={{ height: `${(c / max) * 40}px`, minHeight: c > 0 ? '3px' : '0' }}
          />
          <span className="text-[9px] text-[#444]">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Dashboard ----------
interface DashboardProps {
  items: ShadowCartItem[];
}

export function Dashboard({ items }: DashboardProps) {
  const [settings, setSettings] = useState<UserSettings>({ email: '', emailEnabled: false });
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleSaveSettings = async () => {
    await updateSettings(settings);
    setSaveStatus('Saved!');
    setTimeout(() => setSaveStatus(''), 2000);
  };

  const stats = useMemo(() => {
    const total = items.length;
    if (total === 0) return null;

    const pending = items.filter(i => i.status === 'pending').length;
    const dropped = items.filter(i => i.status === 'dropped').length;
    const bought = items.filter(i => i.status === 'bought').length;
    const saveRate = Math.round(((pending + dropped) / total) * 100);
    const coolingOff = bought + dropped > 0 ? Math.round((dropped / (bought + dropped)) * 100) : 0;

    const siteCounts = items.reduce((acc, item) => {
      acc[item.siteName] = (acc[item.siteName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const topSite = Object.entries(siteCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

    const hourCounts = items.reduce((acc, item) => {
      const h = new Date(item.addedAt).getHours();
      acc[h] = (acc[h] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);
    const peakH = parseInt(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '0', 10);
    const peakHour = peakH === 0 ? '12 AM' : peakH < 12 ? `${peakH} AM` : peakH === 12 ? '12 PM' : `${peakH - 12} PM`;

    const moodCounts = items.reduce((acc, item) => {
      acc[item.mood] = (acc[item.mood] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const mostCommonMood = (Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] as ShadowCartItem['mood']) || 'untagged';

    const moodSegments = (Object.entries(moodCounts) as [MoodTag, number][]).map(([mood, count]) => ({
      value: count,
      color: MOOD_COLORS[mood] || '#374151',
      mood,
    }));

    return { saveRate, coolingOff, topSite, peakHour, mostCommonMood, moodSegments, total, pending, bought, dropped };
  }, [items]);

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center px-6">
        <div className="text-4xl mb-3">👻</div>
        <p className="text-sm text-[#888]">Not enough data yet.<br />Start shopping to see your patterns.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Top stats row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#1a1a1a] rounded-xl p-3.5 border border-white/5">
          <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Impulse Rate</p>
          <p className="text-2xl font-bold text-white">{stats.saveRate}<span className="text-sm font-normal text-[#888]">%</span></p>
          <p className="text-[10px] text-[#6c63ff] mt-0.5">items reconsidered</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl p-3.5 border border-white/5">
          <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Cooling Off</p>
          <p className="text-2xl font-bold text-white">{stats.coolingOff}<span className="text-sm font-normal text-[#888]">%</span></p>
          <p className="text-[10px] text-green-500 mt-0.5">{stats.dropped} dropped vs {stats.bought} bought</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl p-3.5 border border-white/5">
          <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Top Site</p>
          <p className="text-base font-bold text-white truncate">{stats.topSite}</p>
        </div>
        <div className="bg-[#1a1a1a] rounded-xl p-3.5 border border-white/5">
          <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Peak Hour</p>
          <p className="text-base font-bold text-white">{stats.peakHour}</p>
        </div>
      </div>

      {/* Mood chart */}
      <div className="bg-[#1a1a1a] rounded-xl p-3.5 border border-white/5">
        <p className="text-[10px] text-[#666] uppercase tracking-wider mb-3">Mood Breakdown</p>
        <div className="flex gap-4 items-center">
          <DonutChart segments={stats.moodSegments} />
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {[...stats.moodSegments].sort((a, b) => b.value - a.value).slice(0, 4).map(seg => (
              <div key={seg.mood} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                <MoodTagBadge mood={seg.mood} />
                <span className="text-[10px] text-[#555] ml-auto">{seg.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7-day activity */}
      <div className="bg-[#1a1a1a] rounded-xl p-3.5 border border-white/5">
        <p className="text-[10px] text-[#666] uppercase tracking-wider mb-2">Last 7 Days</p>
        <WeekChart items={items} />
      </div>

      {/* Top mood */}
      <div className="bg-[#1a1a1a] rounded-xl p-3.5 border border-white/5 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Most Common Mood</p>
          <MoodTagBadge mood={stats.mostCommonMood} />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#666] uppercase tracking-wider mb-1">Total Items</p>
          <p className="text-lg font-bold text-white">{stats.total}</p>
        </div>
      </div>

      {/* Export */}
      <button
        onClick={() => exportToCSV(items)}
        className="w-full py-2.5 bg-[#1a1a1a] hover:bg-[#222] border border-[#2e2e2e] hover:border-[#6c63ff] rounded-xl text-sm text-[#888] hover:text-white transition-all"
      >
        ↓ Export all data as CSV
      </button>

      {/* Settings Panel */}
      <div className="bg-[#1a1a1a] rounded-xl p-4 border border-white/5 mt-2">
        <h3 className="text-sm font-semibold text-white mb-1">Email Reminders</h3>
        <p className="text-xs text-[#888] mb-4">Receive an email when an item is ready for review.</p>
        
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.emailEnabled}
              onChange={e => setSettings(s => ({ ...s, emailEnabled: e.target.checked }))}
              className="accent-[#6c63ff] w-4 h-4"
            />
            <span className="text-sm text-white">Enable email reminders</span>
          </label>
          
          {settings.emailEnabled && (
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="your@email.com"
                value={settings.email}
                onChange={e => setSettings(s => ({ ...s, email: e.target.value }))}
                className="flex-1 bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#6c63ff] transition-colors"
              />
            </div>
          )}
          
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-green-400">{saveStatus}</span>
            <button
              onClick={handleSaveSettings}
              className="py-1.5 px-4 bg-[#2a2a2a] hover:bg-[#333] border border-[#3a3a3a] hover:border-[#6c63ff] rounded-lg text-xs font-medium text-white transition-all"
            >
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
