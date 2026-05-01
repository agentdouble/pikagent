const { computeRate: genericComputeRate, groupAndAggregate, computeNumericStats } = require('../shared/aggregation-utils');
const { generateDateRange } = require('./date-utils');

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

/** Delegate to generic computeNumericStats from aggregation-utils. */
function computeDuration(durations) {
  return computeNumericStats(durations);
}

function perDay(items, dateExtractor, days = DEFAULT_DAYS) {
  const labels = generateDateRange(days);
  // Group items by date once (O(n)) instead of filtering per label (O(n*d))
  const grouped = groupAndAggregate(
    items,
    (item) => dateExtractor(item),
    (groupItems) => ({ total: groupItems.length, ...countByStatus(groupItems) }),
  );
  return labels.map((day) => ({
    ...day,
    total: 0,
    ...countByStatus([]),
    ...grouped[day.date],
  }));
}

module.exports = { DEFAULT_DAYS, computeRate, computeDuration, perDay };
