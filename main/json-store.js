const fsp = require('fs/promises');
const path = require('path');
const { readJson, writeJson, ensureDirOnce, readDirJson } = require('./fs-utils');
const { createLogger, trySafe } = require('./logger');

/**
 * Generic JSON-file CRUD store.
 *
 * Encapsulates the boilerplate shared by config-manager, flow-manager,
 * and skills-manager: directory initialisation, logger creation,
 * readJson / writeJson / readDirJson, and safe-delete via trySafe + unlink.
 */
class JsonStore {
  /**
   * @param {string} dir      - directory where JSON files are stored
   * @param {string} logLabel - label used for the logger prefix
   */
  constructor(dir, logLabel) {
    this.dir = dir;
    this.log = createLogger(logLabel);
    this._ensureDir = ensureDirOnce(dir);
  }

  /** Ensure the store directory exists (idempotent, runs mkdir once). */
  ensureDir() {
    return this._ensureDir();
  }

  /**
   * Build the full file path for a given id.
   * @param {string} id
   * @returns {string}
   */
  filePath(id) {
    return path.join(this.dir, `${id}.json`);
  }

  /**
   * Read a single JSON file by id. Returns `null` when the file is missing.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async get(id) {
    return readJson(this.filePath(id));
  }

  /**
   * List every JSON object in the store directory.
   * @returns {Promise<object[]>}
   */
  async list() {
    await this.ensureDir();
    return readDirJson(this.dir);
  }

  /**
   * Write `data` as JSON for the given id.
   * @param {string} id
   * @param {object} data
   * @returns {Promise<void>}
   */
  async save(id, data) {
    await this.ensureDir();
    await writeJson(this.filePath(id), data);
  }

  /**
   * Delete the JSON file for `id`.
   * Returns `true` on success, `false` on error (logged as warning).
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  async remove(id) {
    return trySafe(
      async () => {
        await fsp.unlink(this.filePath(id));
        return true;
      },
      false,
      { log: this.log, label: 'remove' },
    );
  }
}

module.exports = { JsonStore };
