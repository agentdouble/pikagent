/**
 * Generic aggregation utilities shared across helper modules.
 * Pure functions — no domain-specific logic.
 *
 * aggregateByKey and groupAndAggregate are re-exported from shared/aggregation-utils.js
 * for cross-process reuse (main + renderer).
 */

const { aggregateByKey, groupAndAggregate } = require('../shared/aggregation-utils');

/**
 * Compute a category rate from items using a category set map.
 * Generic version that accepts category definitions.
 *
 * @param {Array<Record<string, unknown>>} items
 * @param {Record<string, Set<unknown>>} categories - map of categoryName -> Set of matching values
 * @param {string} [field='status'] - field to read from each item
 * @param {string} [rateKey='success'] - category key used to compute the rate
 * @returns {{ total: number, rate: number } & Record<string, number>}
 */
function computeRate(items, categories, field = 'status', rateKey = 'success') {
  const keys = Object.keys(categories);
  const counts = Object.fromEntries(keys.map((k) => [k, 0]));

  for (const item of items) {
    const val = item[field];
    for (const key of keys) {
      if (categories[key].has(val)) { counts[key]++; break; }
    }
  }

  const total = items.length;
  const rate = total > 0 ? Math.round(((counts[rateKey] || 0) / total) * 100) : 0;

  return { total, ...counts, rate };
}

/**
 * Compute basic numeric statistics (avg, min, max, count) from an array of values.
 * Filters out null/undefined/zero/negative values before computing.
 *
 * @param {Array<number|null>} values
 * @returns {{ avg: number, min: number, max: number, count: number }}
 */
function computeNumericStats(values) {
  const valid = values.filter((v) => v != null && v > 0);
  if (valid.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return {
    avg: Math.round(avg),
    min: Math.round(Math.min(...valid)),
    max: Math.round(Math.max(...valid)),
    count: valid.length,
  };
}

module.exports = { aggregateByKey, groupAndAggregate, computeRate, computeNumericStats };
