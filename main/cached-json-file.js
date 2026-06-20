const { readJson, writeJson } = require('./fs-utils');

/**
 * A single JSON file backed by an in-memory cache.
 *
 * Eliminates the repetitive cache + readJson / writeJson / ensureDir pattern
 * shared by config-manager (meta file) and session-manager (sessions file).
 *
 * Usage:
 *   const meta = new CachedJsonFile(META_FILE, ensureDirFn, { defaultConfig: null });
 *   const data = await meta.read();   // cached after first read
 *   await meta.write(newData);        // updates cache + disk
 */
class CachedJsonFile {
  /**
   * @param {string} filePath   - absolute path to the JSON file
   * @param {() => Promise<void>} ensureDirFn - idempotent directory-creation function
   * @param {T} defaultValue    - value returned when the file does not exist
   * @template T
   */
  constructor(filePath, ensureDirFn, defaultValue) {
    this._filePath = filePath;
    this._ensureDir = ensureDirFn;
    this._default = defaultValue;
    this._cache = null;
    this._loaded = false;
  }

  /** Read the file, returning the cached value after the first successful read. */
  async read() {
    if (this._loaded) return this._cache;
    const data = await readJson(this._filePath);
    this._cache = data != null ? data : (
      typeof this._default === 'object' && this._default !== null
        ? (Array.isArray(this._default) ? [...this._default] : { ...this._default })
        : this._default
    );
    this._loaded = true;
    return this._cache;
  }

  /** Write data to disk and update the in-memory cache. */
  async write(data) {
    await this._ensureDir();
    this._cache = data;
    this._loaded = true;
    await writeJson(this._filePath, data);
  }

  /** Return the cached value (or null if not yet loaded). */
  get() {
    return this._cache;
  }

  /** Manually set the cached value without writing to disk. */
  set(value) {
    this._cache = value;
    this._loaded = true;
  }

  /** Invalidate the cache so the next read() will re-fetch from disk. */
  invalidate() {
    this._cache = null;
    this._loaded = false;
  }
}

module.exports = { CachedJsonFile };
