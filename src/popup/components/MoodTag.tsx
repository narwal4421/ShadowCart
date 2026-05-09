import type { MoodTag as MoodType } from '../../types';

const MOOD_CONFIG: Record<MoodType, { label: string, emoji: string, color: string }> = {
  bored: { label: 'Bored', emoji: '\uD83D\uDE34', color: 'bg-gray-700 text-gray-200' },
  stressed: { label: 'Stressed', emoji: '\uD83D\uDE24', color: 'bg-red-900/50 text-red-200' },
  genuinely_need: { label: 'Actually Need', emoji: '\u2705', color: 'bg-green-900/50 text-green-200' },
  treating_myself: { label: 'Treat', emoji: '\uD83C\uDF81', color: 'bg-purple-900/50 text-purple-200' },
  saw_it_somewhere: { label: 'Saw It', emoji: '\uD83D\uDC40', color: 'bg-blue-900/50 text-blue-200' },
  untagged: { label: 'Untagged', emoji: '\u2753', color: 'bg-gray-800 text-gray-400' },
};

export function MoodTag({ mood }: { mood: MoodType }) {
  const config = MOOD_CONFIG[mood] || MOOD_CONFIG.untagged;
  
  return (
    <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium border border-white/5 ${config.color}`}>
      <span>{config.emoji}</span>
      <span>{config.label}</span>
    </div>
  );
}
