/**
 * Shared date/time formatting utilities used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 *
 * Consolidates all date utilities previously spread across:
 *   - shared/date-utils.js (formatDateTime)
 *   - main/date-utils.js   (extractDateString, generateDateRange)
 *   - src/utils/date-utils.js (wrapper)
 */

const DATE_LOCALE = 'fr-FR';
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit' };
const DAY_LABEL_FORMAT = { day: '2-digit', month: '2-digit' };

/**
 * Build a "date time" label from a date string and optional timestamp.
 * e.g. "2025-03-29 14:32" or just "2025-03-29" if no timestamp.
 * @param {string} date - date string (e.g. "2025-03-29")
 * @param {number|string|null} timestamp
 * @returns {string}
 */
function formatDateTime(date, timestamp) {
  const time = timestamp
    ? new Date(timestamp).toLocaleTimeString(DATE_LOCALE, TIME_FORMAT)
    : '';
  return `${date}${time ? ' ' + time : ''}`;
}

/**
 * Extract the YYYY-MM-DD part from an ISO date string.
 * @param {string|null} iso - ISO date string
 * @returns {string|null} "YYYY-MM-DD" or null if falsy
 */
function extractDateString(iso) {
  return iso ? iso.slice(0, 10) : null;
}

/**
 * Generate an array of { date, label } objects for the last N days.
 * @param {number} [days=30] - number of days
 * @returns {Array<{date: string, label: string}>}
 */
function generateDateRange(days = 30) {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString(DATE_LOCALE, DAY_LABEL_FORMAT),
    };
  });
}

/**
 * Return the current instant as an ISO 8601 string (e.g. "2025-03-29T14:32:00.000Z").
 * Replaces the widespread `new Date().toISOString()` pattern.
 * @returns {string}
 */
function nowISO() {
  return new Date().toISOString();
}

/**
 * Return today's date as "YYYY-MM-DD".
 * Replaces `new Date().toISOString().slice(0, 10)`.
 * @returns {string}
 */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Convert an ISO timestamp into a filename-safe string by replacing
 * colons and dots with dashes (e.g. "2025-03-29T14-32-00-000Z").
 * Replaces `.toISOString().replace(/[:.]/g, '-')`.
 * @param {string} [iso] - ISO string; defaults to nowISO()
 * @returns {string}
 */
function toLogFilename(iso) {
  return (iso || nowISO()).replace(/[:.]/g, '-');
}

module.exports = { formatDateTime, extractDateString, generateDateRange, nowISO, todayISO, toLogFilename };
