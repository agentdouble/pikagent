/** Pure helpers and constants for WebviewInstance – no DOM dependency. */

export const LOG_LEVELS = ['verbose', 'info', 'warn', 'error'];
export const MAX_LOGS = 5000;
export const CONSOLE_MIN_HEIGHT = 60;
export const CONSOLE_MAX_HEIGHT = 500;

/** Navigation buttons that proxy a webview method (try/catch wrapper). */
export const WEBVIEW_NAV_ACTIONS = [
  { text: '\u2190', title: 'Back', method: 'goBack' },
  { text: '\u2192', title: 'Forward', method: 'goForward' },
  { text: '\u21BB', title: 'Refresh', method: 'reload' },
];

/** Console toggle button icons. */
export const CONSOLE_ICONS = { open: '\u25bc', closed: '\u25b6' };

/** Map numeric console-message level to a readable name. */
export function resolveLogLevel(numeric) {
  return LOG_LEVELS[numeric] || 'info';
}

/** Format a log count for the badge (caps at "99+"). */
export function formatBadgeText(count) {
  return count > 99 ? '99+' : String(count);
}

/** Format a Date into HH:MM:SS for console log display. */
export function formatLogTime(date) {
  return date.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Extract the filename from a source path (strip leading directories). */
export function shortenSource(source) {
  return source.replace(/.*\//, '');
}

/** Ensure a URL has a protocol prefix. */
export function normalizeUrl(url) {
  return /^https?:\/\//.test(url) ? url : 'http://' + url;
}

/** Clamp a console panel height after a vertical drag delta. */
export function clampConsoleHeight(startHeight, deltaY) {
  return Math.max(CONSOLE_MIN_HEIGHT, Math.min(CONSOLE_MAX_HEIGHT, startHeight + deltaY));
}

/** Shorten level name for compact display ("verbose" → "verb"). */
export function shortLevelLabel(level) {
  return level === 'verbose' ? 'verb' : level;
}
