/**
 * Pure helper functions extracted from UsageView.
 * No DOM or side-effect dependencies — safe to unit-test in isolation.
 */

const RATE_THRESHOLD = 70;

/**
 * Format a duration in seconds into a human-readable string.
 *  - 45        → "45s"
 *  - 90        → "1m 30s"
 *  - 3660      → "1h 1m"
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

/**
 * Format a token count into a compact string.
 *  - 0         → "0"
 *  - 1500      → "1.5k"
 *  - 2300000   → "2.3M"
 */
export function formatTokens(n) {
  if (n == null || n === 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

/**
 * Build a tooltip string for a run-chart day.
 */
export function runTooltip(day) {
  return `${day.label}: ${day.total} (${day.success} ok, ${day.error} err${day.running ? `, ${day.running} en cours` : ''})`;
}

/**
 * Return a CSS color based on success rate vs threshold.
 */
export function rateColor(rate) {
  return rate >= RATE_THRESHOLD ? 'var(--green)' : '#ff6b6b';
}

/**
 * Return a CSS class based on success rate vs threshold.
 */
export function rateCls(rate) {
  return rate >= RATE_THRESHOLD ? 'usage-stat-value-green' : 'usage-stat-value-red';
}
