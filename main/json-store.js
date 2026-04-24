const fsp = require('fs/promises');
const path = require('path');
const { readJson, writeJson, ensureDirOnce, readDirJson } = require('./fs-utils');
const { createLogger, trySafe } = require('./logger');

/**
 * Generic JSON file store — encapsulates the common CRUD pattern
 * shared across config-manager, flow-manager, and skills-manager.
 *
 * Each instance manages a single directory of `<id>.json` files.
 */
class JsonStore {
  /**
   * @param {string} dir       — directory that holds the JSON files
   * @param {string} logLabel  — label used for the createLogger prefix
   */
  constructor(dir, logLabel) {
    this.dir = dir;
    this.log = createLogger(logLabel);
    this.ensureDir = ensureDirOnce(dir);
  }

  /** Build the full path for a given id. */
  path(id) {
    return path.join(this.dir, `${id}.json`);
  }

  /** Read a single JSON file by id. Returns `null` when missing. */
  async get(id) {
    return readJson(this.path(id));
  }

  /** Ensure directory exists, then return all parsed JSON files in it. */
  async list() {
    await this.ensureDir();
    return readDirJson(this.dir);
  }

  /** Ensure directory exists, then write `data` as JSON at `<id>.json`. */
  async save(id, data) {
    await this.ensureDir();
    await writeJson(this.path(id), data);
  }

  /** Delete a JSON file by id. Returns `true` on success, `false` on error. */
  async remove(id) {
    return trySafe(
      () => fsp.unlink(this.path(id)),
      false,
      { log: this.log, label: 'remove' },
    );
  }
}

module.exports = { JsonStore };
