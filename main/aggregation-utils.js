/**
 * Generic aggregation utilities shared across helper modules.
 * Pure functions — no domain-specific logic.
 */

/**
 * @internal
 * Accumulate values into a map keyed by `keyFn(item)`.
 * For each item, calls `accFn(bucket, item)` to merge data into the bucket.
 * Creates new buckets via `initFn()` when a key is first seen.
 *
 * @param {Array} items
 * @param {Function} keyFn    - (item) => string key
 * @param {Function} initFn   - () => initial bucket value
 * @param {Function} accFn    - (bucket, item) => void (mutates bucket)
 * @returns {Object} map of key -> accumulated bucket
 */
function aggregateByKey(items, keyFn, initFn, accFn) {
  const result = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key == null) continue;
    if (!result[key]) result[key] = initFn();
    accFn(result[key], item);
  }
  return result;
}

/**
 * @internal
 * Group items by key, then apply an aggregation function to each group.
 *
 * @param {Array} items
 * @param {Function} keyFn  - (item) => string key
 * @param {Function} aggFn  - (groupItems) => aggregated value
 * @returns {Object} map of key -> aggregated value
 */
function groupAndAggregate(items, keyFn, aggFn) {
  const groups = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key == null) continue;
    (groups[key] ||= []).push(item);
  }
  const result = {};
  for (const [key, group] of Object.entries(groups)) {
    result[key] = aggFn(group);
  }
  return result;
}

/**
 * Compute a category rate from items using a category set map.
 * Generic version that accepts category definitions.
 *
 * @param {Array} items
 * @param {Object} categories - map of categoryName -> Set of matching values
 * @param {string} [field='status'] - field to read from each item
 * @param {string} [rateKey='success'] - category key used to compute the rate
 * @returns {Object} { total, ...counts per category, rate }
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

module.exports = { aggregateByKey, groupAndAggregate, computeRate };
