/**
 * Generic collection utilities shared across helper modules.
 */

/**
 * Groups an array of items by a key function.
 * @param {Array} items
 * @param {(item: unknown) => string} keyFn - Returns the grouping key for each item
 * @returns {Record<string, Array<unknown>>} map of key -> array of items
 */
function groupBy(items, keyFn) {
  const groups = {};
  for (const item of items) {
    const key = keyFn(item);
    (groups[key] ||= []).push(item);
  }
  return groups;
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
