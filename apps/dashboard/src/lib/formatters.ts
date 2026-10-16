export function formatNumber(val: number | null | undefined, decimals = 0): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val);
}

export function formatCurrency(val: number | null | undefined, currency = 'USD'): string {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(d);
  } catch {
    return '—';
  }
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || isNaN(meters)) return '—';
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${meters.toFixed(1)} m`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds)) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const remainingSecs = Math.round(seconds % 60);
  return `${mins}m ${remainingSecs}s`;
}

export function formatPercent(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || isNaN(pct)) return '—';
  const prefix = pct > 0 ? '+' : '';
  return `${prefix}${pct.toFixed(1)}%`;
}

export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return status
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
