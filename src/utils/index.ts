import type { ShadowCartItem } from '../types';

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
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
  return `https://www.google.com/s2/favicons?domain=${siteName}&sz=64`;
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
  URL.revokeObjectURL(url);
}
