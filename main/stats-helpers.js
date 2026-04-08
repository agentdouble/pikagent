const { computeRate: genericComputeRate } = require('./aggregation-utils');
const { extractDateString, generateDateRange } = require('./date-utils');

const DEFAULT_DAYS = 30;

/** Domain-specific status categories — kept here, not in generic utils. */
const STATUS_CATEGORIES = {
  success: new Set(['success', 'completed']),
  error: new Set(['error', 'exited']),
  running: new Set(['running']),
};

function countByStatus(items, field = 'status') {
  const { total, rate, ...counts } = genericComputeRate(items, STATUS_CATEGORIES, field);
  return counts;
}

function computeRate(items, statusField = 'status') {
  if (items.length === 0) return { total: 0, success: 0, error: 0, rate: 0 };
  return genericComputeRate(items, STATUS_CATEGORIES, statusField);
}

function computeDuration(durations) {
  const valid = durations.filter((d) => d != null && d > 0);
  if (valid.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return {
    avg: Math.round(avg),
    min: Math.round(Math.min(...valid)),
    max: Math.round(Math.max(...valid)),
    count: valid.length,
  };
}

/** @internal @deprecated Use extractDateString from date-utils instead. */
function dateStr(iso) {
  return extractDateString(iso);
}

/** @internal @deprecated Use generateDateRange from date-utils instead. */
function dayLabels(days = DEFAULT_DAYS) {
  return generateDateRange(days);
}

function perDay(items, dateExtractor, days = DEFAULT_DAYS) {
  const labels = generateDateRange(days);
  return labels.map((day) => {
    const dayItems = items.filter((r) => dateExtractor(r) === day.date);
    return { ...day, total: dayItems.length, ...countByStatus(dayItems) };
  });
}

module.exports = { DEFAULT_DAYS, countByStatus, computeRate, computeDuration, dateStr, dayLabels, perDay };
