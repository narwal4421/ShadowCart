import { useState } from 'react';
import type { MoodTag } from '../../types';
import browser from 'webextension-polyfill';

interface ManualAddModalProps {
  onClose: () => void;
  onAdded: () => void;
}

const MOOD_OPTIONS: Array<{ value: MoodTag; label: string; emoji: string }> = [
  { value: 'bored', label: 'Bored', emoji: '😴' },
  { value: 'stressed', label: 'Stressed', emoji: '😤' },
  { value: 'genuinely_need', label: 'Need it', emoji: '✅' },
  { value: 'treating_myself', label: 'Treat', emoji: '🎁' },
  { value: 'saw_it_somewhere', label: 'Saw it', emoji: '👀' },
  { value: 'untagged', label: 'Just saving', emoji: '💾' },
];

export function ManualAddModal({ onClose, onAdded }: ManualAddModalProps) {
  const [form, setForm] = useState({ name: '', price: '', productUrl: '', imageUrl: '', mood: 'untagged' as MoodTag });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.productUrl.trim()) { setError('Product URL is required'); return; }
    if (!form.name.trim()) { setError('Product name is required'); return; }
    setLoading(true);
    try {
      let siteName = '';
      try { siteName = new URL(form.productUrl).hostname.replace('www.', ''); } catch { siteName = 'unknown'; }
      await browser.runtime.sendMessage({
        type: 'SAVE_ITEM',
        payload: {
          name: form.name.trim(),
          price: form.price.trim() || 'Price unavailable',
          imageUrl: form.imageUrl.trim(),
          productUrl: form.productUrl.trim(),
          siteName,
          mood: form.mood,
        },
      });
      onAdded();
      onClose();
    } catch (err) {
      setError('Failed to save item. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#6c63ff] transition-colors";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-[#1a1a1a] border-t border-[#2e2e2e] rounded-t-2xl p-5 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">Add Item Manually</h2>
          <button onClick={onClose} className="text-[#555] hover:text-white text-lg transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            className={inputClass}
            placeholder="Product URL *"
            value={form.productUrl}
            onChange={e => setForm(f => ({ ...f, productUrl: e.target.value }))}
          />
          <input
            className={inputClass}
            placeholder="Product name *"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={inputClass}
              placeholder="Price (e.g. $49.99)"
              value={form.price}
              onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
            />
            <input
              className={inputClass}
              placeholder="Image URL (optional)"
              value={form.imageUrl}
              onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
            />
          </div>

          <div>
            <p className="text-xs text-[#888] mb-2">Why do you want this?</p>
            <div className="grid grid-cols-3 gap-1.5">
              {MOOD_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, mood: opt.value }))}
                  className={`py-1.5 px-2 rounded-lg text-xs border transition-colors ${
                    form.mood === opt.value
                      ? 'bg-[#6c63ff] border-[#6c63ff] text-white'
                      : 'bg-[#2a2a2a] border-[#3a3a3a] text-[#888] hover:text-white'
                  }`}
                >
                  {opt.emoji} {opt.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-[#6c63ff] hover:bg-[#5a52d5] disabled:opacity-50 rounded-xl text-sm font-semibold text-white transition-colors"
          >
            {loading ? 'Saving...' : 'Save to ShadowCart 👻'}
          </button>
        </form>
      </div>
    </div>
  );
}
