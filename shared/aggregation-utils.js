/**
 * Shared aggregation utilities used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 *
 * Only generic, pure aggregation logic lives here.
 */

/**
 * Accumulate values into a map keyed by `keyFn(item)`.
 * For each item, calls `accFn(bucket, item)` to merge data into the bucket.
 * Creates new buckets via `initFn()` when a key is first seen.
 *
 * @param {Array<unknown>} items
 * @param {(item: unknown) => string|null} keyFn    - extracts grouping key from item
 * @param {() => unknown} initFn                    - creates initial bucket value
 * @param {(bucket: unknown, item: unknown) => void} accFn - mutates bucket with item
 * @returns {Record<string, unknown>} map of key -> accumulated bucket
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
 * Group items by key, then apply an aggregation function to each group.
 *
 * @param {Array<unknown>} items
 * @param {(item: unknown) => string|null} keyFn  - extracts grouping key from item
 * @param {(groupItems: Array<unknown>) => unknown} aggFn  - aggregation function per group
 * @returns {Record<string, unknown>} map of key -> aggregated value
 */
function groupAndAggregate(items, keyFn, aggFn) {
  const groups = aggregateByKey(items, keyFn, () => [], (bucket, item) => bucket.push(item));
  const result = {};
  for (const [key, group] of Object.entries(groups)) {
    result[key] = aggFn(group);
  }
  return result;
}

/**
 * Build a plain-object counter (all values set to `defaultValue`) from an array of keys.
 * Each element may be a plain string or an object with a `.key` property.
 *
 * @param {Array<string|{key: string}>} keys
 * @param {*} [defaultValue=0]
 * @returns {Record<string, *>}
 */
function initializeCounters(keys, defaultValue = 0) {
  return Object.fromEntries(keys.map(k => [typeof k === 'string' ? k : k.key, defaultValue]));
}

/**
 * Counts occurrences of each key produced by keyFn.
 * @param {Array<unknown>} items
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

/**
 * Build a Map keyed by `keyFn(item)` for O(1) lookup.
 * @param {Array<unknown>} items
 * @param {(item: unknown) => string} keyFn - extracts the lookup key from each item
 * @returns {Map<string, unknown>}
 */
function createLookupMap(items, keyFn) {
  return new Map(items.map(item => [keyFn(item), item]));
}

/**
 * Resolve an array of keys to their values using a lookup Map.
 * Keys not found in the map are silently skipped.
 * @param {Map<string, unknown>} map
 * @param {string[]} keys
 * @returns {Array<unknown>}
 */
function resolveFromMap(map, keys) {
  return keys.map(k => map.get(k)).filter(Boolean);
}

module.exports = { aggregateByKey, groupAndAggregate, countBy, createLookupMap, resolveFromMap, initializeCounters };
