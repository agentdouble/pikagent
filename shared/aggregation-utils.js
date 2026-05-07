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
 * @param {number} [defaultValue=0]
 * @returns {Record<string, number>}
 */
function initializeCounters(keys, defaultValue = 0) {
  return Object.fromEntries(keys.map(k => [typeof k === 'string' ? k : k.key, defaultValue]));
}

/**
 * Accumulate numeric values from `source` into `target` (in-place).
 * For each key in `keys`, adds `source[k]` (defaulting to 0) to `target[k]`.
 *
 * @param {Record<string, number>} target - object to mutate
 * @param {Record<string, number>} source - object to read values from
 * @param {string[]} keys - field names to accumulate
 */
function accumulateBy(target, source, keys) {
  for (const k of keys) target[k] += source[k] || 0;
}

/**
 * Sum the values of `obj` for the given `keys`.
 *
 * @param {Record<string, number>} obj
 * @param {string[]} keys
 * @returns {number}
 */
function sumByKeys(obj, keys) {
  let total = 0;
  for (const k of keys) total += obj[k] || 0;
  return total;
}

/**
 * Map fields from a source object using a field-mapping array.
 * Each entry in `fieldMap` must have a `key` (target name) and an `apiField` (source name).
 * Missing source values default to `defaultValue`.
 *
 * @param {Record<string, unknown>} source
 * @param {Array<{key: string, apiField: string}>} fieldMap
 * @param {number} [defaultValue=0]
 * @returns {Record<string, number>}
 */
function mapFields(source, fieldMap, defaultValue = 0) {
  return Object.fromEntries(fieldMap.map(f => [f.key, source[f.apiField] || defaultValue]));
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
  const counts = initializeCounters(keys);

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

/**
 * Declarative metrics builder. Computes rate, duration, and perDay from a list
 * of items and merges any extra fields supplied by the caller.
 *
 * @param {Array<{ status?: string, [key: string]: unknown }>} items
 * @param {{ rateFn: (items: Array) => Record<string, unknown>,
 *           durationMapper: (item: unknown) => number|null,
 *           dateExtractor: (item: unknown) => string,
 *           perDayFn: (items: Array, dateExtractor: Function, days: number) => Array,
 *           days?: number,
 *           extra?: Record<string, unknown> }} config
 * @returns {Record<string, unknown>}
 */
function buildMetrics(items, { rateFn, durationMapper, dateExtractor, perDayFn, days = 30, extra = {} }) {
  return {
    rate: rateFn(items),
    duration: computeNumericStats(items.map(durationMapper)),
    perDay: perDayFn(items, dateExtractor, days),
    ...extra,
  };
}

/**
 * Factory that pre-binds domain-specific rateFn, perDayFn and days into a
 * simpler metrics builder.  Eliminates repeated config injection at each call site.
 *
 * Usage:
 *   const buildMetrics = createDomainMetricsBuilder({ rateFn, perDayFn, days });
 *   buildMetrics(items, { durationMapper, dateExtractor, extra });
 *
 * @param {{ rateFn: (items: Array) => Record<string, unknown>,
 *           perDayFn: (items: Array, dateExtractor: Function, days: number) => Array,
 *           days?: number }} domainConfig
 * @returns {(items: Array, opts: { durationMapper: Function, dateExtractor: Function, extra?: Record<string, unknown> }) => Record<string, unknown>}
 */
function createDomainMetricsBuilder({ rateFn, perDayFn, days = 30 }) {
  return function domainBuildMetrics(items, { durationMapper, dateExtractor, extra = {} }) {
    return buildMetrics(items, { rateFn, durationMapper, dateExtractor, perDayFn, days, extra });
  };
}

module.exports = {
  aggregateByKey,
  groupAndAggregate,
  accumulateBy,
  sumByKeys,
  mapFields,
  countBy,
  createLookupMap,
  resolveFromMap,
  initializeCounters,
  computeRate,
  computeNumericStats,
  buildMetrics,
  createDomainMetricsBuilder,
};
