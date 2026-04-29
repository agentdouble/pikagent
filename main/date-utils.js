/**
 * Date/time utilities for the main process.
 * Pure functions — no side effects.
 *
 * Generic formatting (formatDateTime) lives in shared/date-utils.js
 * and is re-exported here for backward compatibility.
 * Domain-specific helpers (extractDateString, generateDateRange) stay here.
 */

const { formatDateTime, DATE_LOCALE } = require('../shared/date-utils');
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

module.exports = { extractDateString, generateDateRange, formatDateTime };
