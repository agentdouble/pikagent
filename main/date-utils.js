/**
 * Shared date/time utilities used across main and renderer modules.
 * Pure functions — no side effects.
 */

const DATE_LOCALE = 'fr-FR';
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit' };
const DAY_LABEL_FORMAT = { day: '2-digit', month: '2-digit' };

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

module.exports = { extractDateString, generateDateRange, formatTime, formatDateTime };
