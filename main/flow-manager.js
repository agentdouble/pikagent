const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { FLOWS_DIR, LOGS_DIR, FLOW_CATEGORIES_FILE } = require('./paths');
const { readJson, writeJson, ensureDirOnce } = require('./fs-utils');
const {
  SCHEDULER_INTERVAL_MS, SHELL_INIT_DELAY_MS, MAX_RUN_HISTORY,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS, MAX_FLOW_RUNTIME_MS,
  logPath,
  shouldRun, buildFlowCommand, createOutputProcessor,
} = require('./flow-helpers');
const { safeSend } = require('./ipc-helpers');
const { createPollingManager } = require('../shared/polling-manager');
const { buildRecord } = require('./record-helpers');
const { trySafe } = require('./logger');
const { JsonStore } = require('./json-store');

const store = new JsonStore(FLOWS_DIR, 'flow-manager');
const ensureLogsDir = ensureDirOnce(LOGS_DIR);

class FlowManager {
  constructor() {
    this._polling = createPollingManager(() => this._tick(), {
      intervalMs: SCHEDULER_INTERVAL_MS,
    });
    this._getWindow = null;
    this._ptyManager = null;
    this._runningFlows = new Map();
  }

  start(getWindow, ptyManager) {
    this._getWindow = getWindow;
    this._ptyManager = ptyManager;
    this._polling.start();
  }

  stop() {
    this._polling.stop();
    // Kill all running flow PTY processes and clear their runtime timeouts
    // so stopping the manager never leaks children or pending `setTimeout`s.
    for (const [, { ptyId, timeout }] of this._runningFlows) {
      if (timeout) clearTimeout(timeout);
      this._ptyManager?.kill(ptyId);
    }
    this._runningFlows.clear();
  }

  // --- Window IPC helper ---

  _sendToWindow(channel, payload) {
    if (this._getWindow) safeSend(this._getWindow, channel, payload);
  }

  // --- CRUD ---

  async save(flow) {
    await ensureLogsDir();
    const existing = await this.get(flow.id);
    const now = new Date().toISOString();
    const data = buildRecord(flow, { createdAt: existing?.createdAt || now, updatedAt: now });
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
    return trySafe(
      async () => {
        await store.remove(id);
        await this._cleanLogs(id);
        return true;
      },
      false,
      { log: store.log, label: 'remove' },
    );
  }

  async toggleEnabled(id) {
    const flow = await this.get(id);
    if (!flow) return null;
    flow.enabled = !flow.enabled;
    return this.save(flow);
  }

  getRunning() {
    return Object.fromEntries(
      [...this._runningFlows].map(([id, { ptyId }]) => [id, ptyId])
    );
  }

  async getRunLog(flowId, timestamp) {
    return trySafe(
      () => fsp.readFile(logPath(flowId, timestamp), 'utf-8'),
      null,
      { log: store.log, label: 'getRunLog' },
    );
  }

  // --- Categories ---

  async getCategories() {
    await store.ensureDir();
    const data = await readJson(FLOW_CATEGORIES_FILE);
    return data || { categories: [], order: {} };
  }

  async saveCategories(data) {
    await store.ensureDir();
    await writeJson(FLOW_CATEGORIES_FILE, data);
    return data;
  }

  async _cleanLogs(flowId) {
    await trySafe(
      async () => {
        const files = (await fsp.readdir(LOGS_DIR)).filter((f) => f.startsWith(flowId + '_'));
        await Promise.all(files.map((f) => fsp.unlink(path.join(LOGS_DIR, f))));
      },
      undefined,
      { log: store.log, label: 'cleanLogs' },
    );
  }

  // --- Scheduling ---

  async _tick() {
    const now = new Date();
    const flows = await this.list();

    for (const flow of flows) {
      if (!flow.enabled) continue;
      if (this._runningFlows.has(flow.id)) continue;
      if (shouldRun(flow, now)) {
        this._execute(flow);
      }
    }
  }

  // --- Execution ---

  async _saveLog(flowId, runTimestamp, output) {
    await ensureLogsDir();
    await trySafe(
      () => fsp.writeFile(logPath(flowId, runTimestamp), output, 'utf-8'),
      undefined,
      { log: store.log, label: 'saveLog' },
    );
  }

  _setupPtyListeners(proc, flow, ptyId, runTimestamp) {
    const output = createOutputProcessor(flow.agent);

    proc.onData((data) => {
      const formatted = output.processData(data);
      if (formatted) this._sendToWindow('pty:data', { id: ptyId, data: formatted });
    });

    proc.onExit(async ({ exitCode }) => {
      const remaining = output.flush();
      if (remaining) this._sendToWindow('pty:data', { id: ptyId, data: remaining });

      this._cleanupFlowProcess(flow.id, ptyId, exitCode);
      await this._saveLog(flow.id, runTimestamp, output.getOutput());
      await this._recordRun(flow.id, exitCode === 0 ? 'success' : 'error', runTimestamp);
    });
  }

  _cleanupFlowProcess(flowId, ptyId, exitCode) {
    const entry = this._runningFlows.get(flowId);
    if (entry?.timeout) clearTimeout(entry.timeout);
    this._ptyManager.processes.delete(ptyId);
    this._runningFlows.delete(flowId);
    this._sendToWindow('pty:exit', { id: ptyId, exitCode });
    this._sendToWindow('flow:runComplete', { flowId, ptyId, exitCode });
  }

  _execute(flow) {
    if (!this._ptyManager) return;

    const ptyId = `flow-${flow.id}-${Date.now()}`;
    const cwd = flow.cwd || os.homedir();
    const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

    try {
      const proc = this._ptyManager.create({
        id: ptyId,
        cwd,
        cols: DEFAULT_PTY_COLS,
        rows: DEFAULT_PTY_ROWS,
      });

      this._setupPtyListeners(proc, flow, ptyId, runTimestamp);

      // Auto-kill flows that exceed the max runtime
      const timeout = setTimeout(() => {
        console.warn(`Flow ${flow.id} exceeded max runtime (${MAX_FLOW_RUNTIME_MS / 60000}min), killing`);
        this._ptyManager.kill(ptyId);
      }, MAX_FLOW_RUNTIME_MS);

      this._runningFlows.set(flow.id, { ptyId, proc, timeout });

      this._sendToWindow('flow:runStarted', {
        flowId: flow.id,
        ptyId,
        flowName: flow.name,
      });

      const cmd = buildFlowCommand(flow);
      setTimeout(() => {
        this._ptyManager.write(ptyId, cmd);
      }, SHELL_INIT_DELAY_MS);
    } catch (err) {
      store.log.error('execution failed', err);
      this._recordRun(flow.id, 'error', runTimestamp);
    }
  }

  async runNow(id) {
    const flow = await this.get(id);
    if (!flow) return false;
    if (this._runningFlows.has(id)) return false;
    this._execute(flow);
    return true;
  }

  async _recordRun(flowId, status, runTimestamp) {
    const flow = await this.get(flowId);
    if (!flow) return;
    const now = new Date().toISOString();
    const runs = flow.runs || [];
    runs.push({
      date: now.slice(0, 10),
      timestamp: now,
      logTimestamp: runTimestamp,
      status,
    });
    flow.runs = runs.length > MAX_RUN_HISTORY ? runs.slice(-MAX_RUN_HISTORY) : runs;
    await this.save(flow);
  }

  // Aliases matching channel suffixes (flow:delete → delete, flow:toggle → toggle)
  delete(id) { return this.remove(id); }
  toggle(id) { return this.toggleEnabled(id); }

  cleanup() {
    this.stop();
  }
}

module.exports = new FlowManager();
