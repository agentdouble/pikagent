/**
 * Generic collection utilities shared across helper modules.
 */

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

module.exports = { countBy };
