/**
 * Reusable cache with optional TTL support.
 *
 * Usage:
 *   const cache = new Cache();            // no TTL (never expires)
 *   const cache = new Cache(30000);       // 30 s TTL
 *
 *   cache.set(value);
 *   cache.get();        // returns value or null if expired / unset
 *   cache.clear();
 */
class Cache {
  /**
   * @param {number|null} ttl - Time-to-live in ms. Null or 0 means no expiration.
   */
  constructor(ttl = null) {
    this._ttl = ttl || 0;
    this._value = null;
    this._updatedAt = 0;
  }

  /** Return cached value, or null if unset / expired. */
  get() {
    if (this._value === null) return null;
    if (this._ttl > 0 && (Date.now() - this._updatedAt) >= this._ttl) {
      this._value = null;
      return null;
    }
    return this._value;
  }

  /** Store a value and refresh the timestamp. */
  set(value) {
    this._value = value;
    this._updatedAt = Date.now();
  }

  /** Clear the cache. */
  clear() {
    this._value = null;
    this._updatedAt = 0;
  }
}

/**
 * Returns an async function that checks the cache first, and only calls `fn`
 * on a cache miss. The result is stored in the cache before being returned.
 *
 * Eliminates the repetitive pattern:
 *   const cached = cache.get();
 *   if (cached) return cached;
 *   const result = await computeExpensive();
 *   cache.set(result);
 *   return result;
 *
 * @param {Cache} cache - Cache instance to use
 * @param {() => Promise<T>} fn - Async function to compute the value on cache miss
 * @returns {() => Promise<T>}
 * @template T
 */
function cachedAsync(cache, fn) {
  return async () => {
    const cached = cache.get();
    if (cached) return cached;
    const result = await fn();
    cache.set(result);
    return result;
  };
}

module.exports = { Cache, cachedAsync };
