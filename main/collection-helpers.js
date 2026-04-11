/**
 * Generic collection utilities shared across helper modules.
 */

const { aggregateByKey } = require('./aggregation-utils');

/**
 * Groups an array of items by a key function.
 * Delegates to {@link aggregateByKey} with array-push accumulation.
 * @param {Array} items
 * @param {(item: unknown) => string} keyFn - Returns the grouping key for each item
 * @returns {Record<string, Array<unknown>>} map of key -> array of items
 */
function groupBy(items, keyFn) {
  return aggregateByKey(items, keyFn, () => [], (bucket, item) => bucket.push(item));
}

/**
 * Counts occurrences of each key produced by keyFn.
 * @param {Array} items
 * @param {(item: unknown) => string} keyFn - Returns the key for each item
 * @returns {Record<string, number>} map of key -> count
 */
function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

module.exports = { groupBy, countBy };
