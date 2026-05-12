const path = require('path');
const fsp = require('fs/promises');
const { readJson, writeJson, readDirJson, ensureDirOnce } = require('./fs-utils');
const { createLogger, trySafe } = require('./logger');

/**
 * Reusable JSON-file CRUD store.
 *
 * Encapsulates the boilerplate shared by config-manager and flow-manager:
 *   ensureDir  → readJson / writeJson / readDirJson / fsp.unlink
 *
 * Each manager composes a JsonStore and layers its own business logic on top.
 */
class JsonStore {
  /**
   * @param {string} dir       - directory that holds the JSON files
   * @param {string} logLabel  - label forwarded to createLogger
   * @param {{ idToFile?: (id: string) => string }} [opts]
   *   idToFile – optional function that maps an id to its filename (without
   *              the directory prefix). Defaults to `${id}.json`.
   */
  constructor(dir, logLabel, opts = {}) {
    this._dir = dir;
    this._log = createLogger(logLabel);
    this._ensureDir = ensureDirOnce(dir);
    this._idToFile = opts.idToFile || ((id) => `${id}.json`);
  }

  /** Resolve the full path for a given id. */
  _path(id) {
    return path.join(this._dir, this._idToFile(id));
  }

  /** Read a single record by id (returns null when missing). */
  async get(id) {
    return readJson(this._path(id));
  }

  /** List every JSON record in the directory. */
  async list() {
    await this._ensureDir();
    return readDirJson(this._dir);
  }

  /** Persist `data` under the given id. */
  async save(id, data) {
    await this._ensureDir();
    return writeJson(this._path(id), data);
  }

  /** Delete the file for the given id. Returns true on success, false on error. */
  async remove(id) {
    return trySafe(
      () => fsp.unlink(this._path(id)),
      false,
      { log: this._log, label: 'remove' },
    );
  }

  /**
   * Delete the file for the given id, throwing on error.
   *
   * Use this instead of `remove()` when the caller wraps the call in its own
   * `trySafe` and needs errors to propagate (e.g. to skip follow-up cleanup
   * when the file deletion fails).
   */
  async removeOrThrow(id) {
    await fsp.unlink(this._path(id));
  }

  /** Ensure the backing directory exists (idempotent). */
  async ensureDir() {
    return this._ensureDir();
  }

  /**
   * Read a JSON file at an arbitrary absolute path (returns null when missing).
   * Useful for satellite files (e.g. categories) that live alongside the store.
   */
  async readFile(filePath) {
    return readJson(filePath);
  }

  /**
   * Write a JSON file at an arbitrary absolute path.
   * Ensures the store directory exists first.
   */
  async writeFile(filePath, data) {
    await this._ensureDir();
    return writeJson(filePath, data);
  }

  /** Expose the logger so the owning manager can reuse it. */
  get log() {
    return this._log;
  }

  /**
   * Convenience wrapper around `trySafe` pre-bound to this store's logger.
   *
   * Allows callers to perform safe operations without importing `trySafe`
   * from `./logger` separately.
   *
   * @template T
   * @param {() => T | Promise<T>} fn
   * @param {T} fallback
   * @param {string} label
   * @returns {Promise<T>}
   */
  trySafe(fn, fallback, label) {
    return trySafe(fn, fallback, { log: this._log, label });
  }

  /**
   * Resolve a satellite file path relative to the store directory.
   *
   * Useful for files that live alongside the store records (e.g. categories)
   * without forcing callers to import the full path from `./paths`.
   *
   * @param {string} filename
   * @returns {string}
   */
  resolve(filename) {
    return path.join(this._dir, filename);
  }
}

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
        ? { ...this._default }
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
}

module.exports = { JsonStore, CachedJsonFile };
