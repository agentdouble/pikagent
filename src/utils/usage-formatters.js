/**
 * Pure helper functions extracted from UsageView.
 * No DOM or side-effect dependencies — safe to unit-test in isolation.
 */

const RATE_THRESHOLD = 70;

/** Single source of truth for rate-based styling (color + CSS class). */
const RATE_STYLES = {
  good: { color: 'var(--green)', cls: 'usage-stat-value-green' },
  poor: { color: '#ff6b6b', cls: 'usage-stat-value-red' },
};

/** Magnitude tiers for compact number formatting (order: largest first). */
const MAGNITUDE_TIERS = [
  { threshold: 1_000_000, suffix: 'M' },
  { threshold: 1_000, suffix: 'k' },
];

/** Duration units for human-readable time formatting (order: largest first). */
const DURATION_UNITS = [
  { divisor: 3600, label: 'h', subDivisor: 60, subLabel: 'm' },
  { divisor: 60, label: 'm', subDivisor: 1, subLabel: 's' },
];

function _rateStyle(rate) {
  return rate >= RATE_THRESHOLD ? RATE_STYLES.good : RATE_STYLES.poor;
}

/**
 * Format a duration in seconds into a human-readable string.
 *  - 45        → "45s"
 *  - 90        → "1m 30s"
 *  - 3660      → "1h 1m"
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  for (const { divisor, label, subDivisor, subLabel } of DURATION_UNITS) {
    if (seconds >= divisor) {
      const main = Math.floor(seconds / divisor);
      const remainder = Math.floor((seconds % divisor) / subDivisor);
      return remainder > 0 ? `${main}${label} ${remainder}${subLabel}` : `${main}${label}`;
    }
  }
  return `${seconds}s`;
}

/**
 * Format a token count into a compact string.
 *  - 0         → "0"
 *  - 1500      → "1.5k"
 *  - 2300000   → "2.3M"
 */
export function formatTokens(n) {
  if (n == null || n === 0) return '0';
  for (const { threshold, suffix } of MAGNITUDE_TIERS) {
    if (n >= threshold) return `${(n / threshold).toFixed(1)}${suffix}`;
  }
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
  return _rateStyle(rate).color;
}

/**
 * Return a CSS class based on success rate vs threshold.
 */
export function rateCls(rate) {
  return _rateStyle(rate).cls;
}
