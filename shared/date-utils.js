/**
 * Shared date/time formatting utilities used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 *
 * Only generic formatting lives here — domain-specific date logic
 * (extractDateString, generateDateRange) stays in main/date-utils.js.
 */

const DATE_LOCALE = 'fr-FR';
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit' };

/**
 * Format a timestamp into a short time string (e.g. "14:32").
 * Returns '' if timestamp is falsy.
 * @param {number|string|null} timestamp
 * @returns {string}
 */
function formatTime(timestamp) {
  return timestamp
    ? new Date(timestamp).toLocaleTimeString(DATE_LOCALE, TIME_FORMAT)
    : '';
}

/**
 * Build a "date time" label from a date string and optional timestamp.
 * e.g. "2025-03-29 14:32" or just "2025-03-29" if no timestamp.
 * @param {string} date - date string (e.g. "2025-03-29")
 * @param {number|string|null} timestamp
 * @returns {string}
 */
function formatDateTime(date, timestamp) {
  const time = formatTime(timestamp);
  return `${date}${time ? ' ' + time : ''}`;
}

module.exports = { formatTime, formatDateTime };
