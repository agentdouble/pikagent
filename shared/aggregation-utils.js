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

module.exports = { aggregateByKey, groupAndAggregate, countBy };
