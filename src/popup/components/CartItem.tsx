import { useEffect, useState } from 'react';
import type { ShadowCartItem } from '../../types';
import { MoodTag } from './MoodTag';
import { timeAgo, timeLeftStr, getFaviconUrl } from '../../utils';

const FALLBACK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

interface CartItemProps {
  item: ShadowCartItem;
  onBuy?: (id: string, url: string) => void;
  onDrop?: (id: string, name: string) => void;
  onSnooze?: (id: string) => void;
  isHistory?: boolean;
}

export function CartItem({ item, onBuy, onDrop, onSnooze, isHistory = false }: CartItemProps) {
  const [countdown, setCountdown] = useState('');
  const [imgSrc, setImgSrc] = useState(item.imageUrl || getFaviconUrl(item.siteName));

  useEffect(() => {
    if (isHistory) return;
    let timeout: ReturnType<typeof setTimeout>;
    const update = () => {
      const diff = item.remindAt - Date.now();
      setCountdown(timeLeftStr(item.remindAt));
      timeout = setTimeout(update, diff > 0 && diff < 10 * 60 * 1000 ? 10000 : 60000);
    };
    update();
    return () => clearTimeout(timeout);
  }, [item.remindAt, isHistory]);

  return (
    <div className="bg-[#1a1a1a] rounded-xl p-3 border border-white/5 flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="w-14 h-14 rounded-lg bg-[#2a2a2a] overflow-hidden flex-shrink-0 flex items-center justify-center">
          <img
            src={imgSrc}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={() => {
              const faviconUrl = getFaviconUrl(item.siteName);
              if (imgSrc !== faviconUrl) {
                setImgSrc(faviconUrl);
              } else if (imgSrc !== FALLBACK_IMAGE) {
                setImgSrc(FALLBACK_IMAGE);
              }
            }}
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <h3 className="text-sm font-medium text-white truncate" title={item.name}>{item.name}</h3>
            <p className="text-xs text-[#888888] mt-0.5">{item.siteName} · {item.price}</p>
            <p className="text-[10px] text-[#555] mt-0.5">{timeAgo(item.addedAt)}</p>
          </div>
          <div className="flex items-center justify-between mt-1">
            <MoodTag mood={item.mood} />
            {!isHistory && countdown && (
              <span className={`text-[10px] font-medium tabular-nums ${countdown === 'Ready' ? 'text-[#6c63ff]' : 'text-[#666]'}`}>
                {countdown === 'Ready' ? '⏰ Ready' : `⏱ ${countdown}`}
              </span>
            )}
            {isHistory && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.status === 'bought' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {item.status === 'bought' ? '✓ Bought' : '✕ Dropped'}
              </span>
            )}
          </div>
        </div>
      </div>

      {!isHistory && (
        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => onBuy?.(item.id, item.productUrl)}
            className="py-1.5 bg-[#6c63ff] hover:bg-[#5a52d5] rounded-lg text-xs font-semibold text-white transition-colors"
          >
            Buy Now
          </button>
          <button
            onClick={() => onSnooze?.(item.id)}
            title="Remind me in 24 more hours"
            className="py-1.5 bg-[#2a2a2a] hover:bg-[#333] border border-[#3a3a3a] rounded-lg text-xs text-[#888] hover:text-white transition-colors"
          >
            😴 +24h
          </button>
          <button
            onClick={() => onDrop?.(item.id, item.name)}
            className="py-1.5 bg-transparent hover:bg-red-900/20 border border-[#3a3a3a] hover:border-red-800/50 text-[#777] hover:text-red-400 rounded-lg text-xs transition-colors"
          >
            Drop
          </button>
        </div>
      )}
    </div>
  );
}
