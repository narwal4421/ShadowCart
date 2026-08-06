import { useState, useEffect, useMemo } from 'react';
import { getSettings } from '../../db';

interface SnoozeModalProps {
  itemName: string;
  initialEmail?: string;
  onConfirm: (remindAt: number, email?: string) => void;
  onClose: () => void;
}

const PRESETS = [
  { label: '1 hour',  ms: 1 * 60 * 60 * 1000 },
  { label: '3 hours', ms: 3 * 60 * 60 * 1000 },
  { label: '6 hours', ms: 6 * 60 * 60 * 1000 },
  { label: '12 hours', ms: 12 * 60 * 60 * 1000 },
  { label: '1 day',   ms: 24 * 60 * 60 * 1000 },
  { label: '2 days',  ms: 48 * 60 * 60 * 1000 },
  { label: '1 week',  ms: 7 * 24 * 60 * 60 * 1000 },
];

// Format a Date as a local datetime-local string (required by <input type="datetime-local">)
function toLocalDatetimeString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function SnoozeModal({ itemName, initialEmail, onConfirm, onClose }: SnoozeModalProps) {
  // Default custom picker to tomorrow at 10am
  const [now] = useState(() => Date.now());
  const tomorrow = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d;
  }, [now]);

  const [customDatetime, setCustomDatetime] = useState(toLocalDatetimeString(tomorrow));
  const [selected, setSelected] = useState<number | null>(null);
  const [mode, setMode] = useState<'presets' | 'custom'>('presets');

  // min for datetime-local = now + 5 mins
  const minDatetime = useMemo(() => toLocalDatetimeString(new Date(now + 5 * 60 * 1000)), [now]);

  const [emailEnabled, setEmailEnabled] = useState(Boolean(initialEmail));
  const [email, setEmail] = useState(initialEmail || '');
  const [emailError, setEmailError] = useState('');

  useEffect(() => {
    if (!initialEmail) {
      getSettings().then(settings => {
        if (settings.email) setEmail(settings.email);
      });
    }
  }, [initialEmail]);

  const handleConfirm = () => {
    let chosenEmail: string | undefined = undefined;
    if (emailEnabled && email.trim()) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        setEmailError('Enter a valid email address.');
        return;
      }
      chosenEmail = email.trim();
    }
    setEmailError('');

    if (mode === 'presets' && selected !== null) {
      onConfirm(Date.now() + selected, chosenEmail);
    } else if (mode === 'custom' && customDatetime) {
      const ts = new Date(customDatetime).getTime();
      if (ts > Date.now()) onConfirm(ts, chosenEmail);
    }
  };

  const isReady = mode === 'presets'
    ? selected !== null
    : customDatetime !== '' && new Date(customDatetime).getTime() > now;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-[#1a1a1a] border-t border-[#2e2e2e] rounded-t-2xl p-5 flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Set a reminder</h2>
            <p className="text-[11px] text-[#666] mt-0.5 truncate max-w-[260px]">{itemName}</p>
          </div>
          <button onClick={onClose} className="text-[#555] hover:text-white text-lg transition-colors flex-shrink-0">✕</button>
        </div>

        {/* Mode Toggle */}
        <div className="flex bg-[#111] border border-[#2a2a2a] rounded-xl p-1 gap-1">
          <button
            onClick={() => setMode('presets')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${mode === 'presets' ? 'bg-[#6c63ff] text-white' : 'text-[#555] hover:text-[#888]'}`}
          >
            Quick presets
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${mode === 'custom' ? 'bg-[#6c63ff] text-white' : 'text-[#555] hover:text-[#888]'}`}
          >
            Pick a date & time
          </button>
        </div>

        {/* Presets Grid */}
        {mode === 'presets' && (
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map(preset => (
              <button
                key={preset.ms}
                onClick={() => setSelected(preset.ms)}
                className={`py-2 px-1 rounded-xl text-xs font-medium border transition-all ${
                  selected === preset.ms
                    ? 'bg-[#6c63ff] border-[#6c63ff] text-white scale-105'
                    : 'bg-[#111] border-[#2a2a2a] text-[#888] hover:border-[#6c63ff] hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        {/* Custom picker */}
        {mode === 'custom' && (
          <div className="flex flex-col gap-2">
            <input
              type="datetime-local"
              value={customDatetime}
              min={minDatetime}
              onChange={e => setCustomDatetime(e.target.value)}
              className="w-full bg-[#111] border border-[#333] rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#6c63ff] transition-colors"
              style={{ colorScheme: 'dark' }}
            />
            {customDatetime && new Date(customDatetime).getTime() > now && (
              <p className="text-[11px] text-[#555] text-center">
                Reminder in{' '}
                <span className="text-[#6c63ff] font-medium">
                  {(() => {
                    const diff = new Date(customDatetime).getTime() - now;
                    const h = Math.floor(diff / 3600000);
                    const d = Math.floor(h / 24);
                    return d > 0 ? `${d} day${d > 1 ? 's' : ''} ${h % 24}h` : `${h}h ${Math.floor((diff % 3600000) / 60000)}m`;
                  })()}
                </span>
              </p>
            )}
          </div>
        )}

        {/* Email Reminder Opt-in */}
        <div className="flex flex-col gap-2 mt-2 pt-4 border-t border-[#2a2a2a]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={emailEnabled}
              onChange={e => setEmailEnabled(e.target.checked)}
              className="accent-[#6c63ff] w-4 h-4"
            />
            <span className="text-xs text-[#aaa]">Also get this reminder on mail</span>
          </label>
          
          {emailEnabled && (
            <input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                setEmailError('');
              }}
              className="w-full bg-[#111] border border-[#333] rounded-lg px-3 py-2 text-sm text-white placeholder-[#555] focus:outline-none focus:border-[#6c63ff] transition-colors"
            />
          )}
          {emailError && <p className="text-xs text-red-400">{emailError}</p>}
        </div>

        {/* Confirm button */}
        <button
          onClick={handleConfirm}
          disabled={!isReady || (emailEnabled && !email.trim())}
          className="w-full py-2.5 bg-[#6c63ff] hover:bg-[#5a52d5] disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-all"
        >
          ⏰ Set Reminder
        </button>
      </div>
    </div>
  );
}
