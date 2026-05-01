/**
 * High-level flow orchestration — CRUD, categories, and lifecycle.
 *
 * Delegates scheduling to flow-scheduler.js and execution to
 * flow-executor.js, keeping this module focused on data management,
 * IPC communication, and wiring the sub-modules together.
 */

const { FLOWS_DIR } = require('./paths');
const { safeSend } = require('./ipc-helpers');
const { buildTimestampedRecord } = require('./record-helpers');
const { JsonStore } = require('./json-store');
const { createFlowScheduler } = require('./flow-scheduler');
const { createFlowExecutor } = require('./flow-executor');

const store = new JsonStore(FLOWS_DIR, 'flow-manager');
const CATEGORIES_FILE = store.resolve('categories.json');

class FlowManager {
  constructor() {
    this._getWindow = null;
    this._ptyManager = null;

    // Wire executor — delegates PTY management and output collection
    this._executor = createFlowExecutor({
      getPtyManager: () => this._ptyManager,
      sendToWindow: (channel, payload) => this._sendToWindow(channel, payload),
      getFlow: (id) => this.get(id),
      saveFlow: (flow) => this.save(flow),
      log: store.log,
    });

    // Wire scheduler — delegates schedule evaluation and polling
    this._scheduler = createFlowScheduler(
      {
        list: () => this.list(),
        isRunning: (id) => this._executor.runningFlows.has(id),
      },
      (flow) => this._executor.execute(flow),
    );
  }

  start(getWindow, ptyManager) {
    this._getWindow = getWindow;
    this._ptyManager = ptyManager;
    this._scheduler.start();
  }

  stop() {
    this._scheduler.stop();
    this._executor.stopAll();
  }

  // --- Window IPC helper ---

  _sendToWindow(channel, payload) {
    if (this._getWindow) safeSend(this._getWindow, channel, payload);
  }

  // --- CRUD ---

  async save(flow) {
    const existing = await this.get(flow.id);
    const data = buildTimestampedRecord(flow, existing);
    if (!data.runs) data.runs = [];
    if (data.enabled === undefined) data.enabled = true;
    await store.save(flow.id, data);
    return data;
  }

  async get(id) {
    return store.get(id);
  }

  async list() {
    return store.list();
  }

  async remove(id) {
    return store.trySafe(
      async () => {
        await store.removeOrThrow(id);
        await this._cleanLogs(id);
        return true;
      },
      false,
      'remove',
    );
  }

  async toggleEnabled(id) {
    const flow = await this.get(id);
    if (!flow) return null;
    flow.enabled = !flow.enabled;
    return this.save(flow);
  }

  getRunning() {
    return this._executor.getRunning();
  }

  async getRunLog(flowId, timestamp) {
    return this._executor.getRunLog(flowId, timestamp);
  }

  // --- Categories ---

  async getCategories() {
    await store.ensureDir();
    const data = await store.readFile(CATEGORIES_FILE);
    return data || { categories: [], order: {} };
  }

  async saveCategories(data) {
    await store.writeFile(CATEGORIES_FILE, data);
    return data;
  }

  async _cleanLogs(flowId) {
    await this._executor.cleanLogs(flowId);
  }

  // --- On-demand execution ---

  async runNow(id) {
    const flow = await this.get(id);
    if (!flow) return false;
    if (this._executor.runningFlows.has(id)) return false;
    this._executor.execute(flow);
    return true;
  }

  // Aliases matching channel suffixes (flow:delete → delete, flow:toggle → toggle)
  delete(id) { return this.remove(id); }
  toggle(id) { return this.toggleEnabled(id); }

  cleanup() {
    this.stop();
  }
}

module.exports = new FlowManager();
