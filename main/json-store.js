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

  /** Expose the logger so the owning manager can reuse it. */
  get log() {
    return this._log;
  }
}

module.exports = { JsonStore };
