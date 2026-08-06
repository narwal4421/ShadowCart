import type { ShadowCartItem } from '../types';

// ─── Affiliate configuration ────────────────────────────────────────────────
const AFFILIATE_CONFIG = {
  amazon: {
    tag: 'shadowcart0c-21',
    domains: ['amazon.in', 'amazon.com', 'amazon.co.uk', 'amzn.to', 'amzn.in'],
  },
  // Flipkart affiliate ID — add here once registered
  // flipkart: { id: '', domains: ['flipkart.com'] },
};

/**
 * Wraps a product URL with the appropriate affiliate tag.
 * Falls back to the original URL if the domain has no affiliate program.
 */
export function getAffiliateUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.replace('www.', '');

    // Amazon
    if (AFFILIATE_CONFIG.amazon.domains.some(d => hostname === d || hostname.endsWith('.' + d))) {
      url.searchParams.set('tag', AFFILIATE_CONFIG.amazon.tag);
      // Remove conflicting params that break affiliate attribution
      url.searchParams.delete('ref');
      url.searchParams.delete('linkCode');
      return url.toString();
    }

    // Flipkart (uncomment when ID is ready)
    // if (hostname.includes('flipkart.com')) {
    //   url.searchParams.set('affid', AFFILIATE_CONFIG.flipkart.id);
    //   return url.toString();
    // }

    return rawUrl;
  } catch {
    return rawUrl;
  }
}


export function timeAgo(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function timeLeftStr(remindAt: number): string {
  const diff = remindAt - Date.now();
  if (diff <= 0) return 'Ready';
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export function getFaviconUrl(siteName: string): string {
  return `https://icons.duckduckgo.com/ip3/${siteName}.ico`;
}

export function exportToCSV(items: ShadowCartItem[]): void {
  const headers = ['Name', 'Price', 'Site', 'Mood', 'Status', 'Added At', 'Product URL'];
  const rows = items.map(item => [
    `"${item.name.replace(/"/g, '""')}"`,
    `"${item.price}"`,
    item.siteName,
    item.mood,
    item.status,
    new Date(item.addedAt).toLocaleString(),
    item.productUrl,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shadowcart-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}
