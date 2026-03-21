const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const FLOWS_DIR = path.join(BASE_DIR, 'flows');
const LOGS_DIR = path.join(FLOWS_DIR, 'logs');

const SCHEDULER_INTERVAL_MS = 60_000;
const SHELL_INIT_DELAY_MS = 500;
const MAX_RUN_HISTORY = 7;
const DEFAULT_PTY_COLS = 120;
const DEFAULT_PTY_ROWS = 30;

const AGENT_COMMANDS = {
  claude: (prompt) => `claude --permission-mode auto -p '${prompt}'`,
  codex: (prompt) => `codex --approval-mode full-auto --quiet '${prompt}'`,
  opencode: (prompt) => `opencode -p '${prompt}'`,
};

async function ensureDir() {
  await fsp.mkdir(FLOWS_DIR, { recursive: true });
  await fsp.mkdir(LOGS_DIR, { recursive: true });
}

function flowPath(id) {
  return path.join(FLOWS_DIR, `${id}.json`);
}

function logPath(flowId, timestamp) {
  return path.join(LOGS_DIR, `${flowId}_${timestamp}.log`);
}

// Sync ensureDir for startup only (called once)
function ensureDirSync() {
  fs.mkdirSync(FLOWS_DIR, { recursive: true });
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

class FlowManager {
  constructor() {
    this._timer = null;
    this._getWindow = null;
    this._ptyManager = null;
    this._runningFlows = new Map();
  }

  start(getWindow, ptyManager) {
    this._getWindow = getWindow;
    this._ptyManager = ptyManager;
    this._timer = setInterval(() => this._tick(), SCHEDULER_INTERVAL_MS);
    this._tick();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // --- Window IPC helper ---

  _sendToWindow(channel, payload) {
    const win = this._getWindow?.();
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }

  // --- CRUD ---

  async save(flow) {
    await ensureDir();
    const existing = await this.get(flow.id);
    const data = {
      ...flow,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!data.runs) data.runs = [];
    if (data.enabled === undefined) data.enabled = true;
    await fsp.writeFile(flowPath(flow.id), JSON.stringify(data, null, 2), 'utf-8');
    return data;
  }

  async get(id) {
    try {
      return JSON.parse(await fsp.readFile(flowPath(id), 'utf-8'));
    } catch {
      return null;
    }
  }

  async list() {
    await ensureDir();
    try {
      const files = (await fsp.readdir(FLOWS_DIR)).filter((f) => f.endsWith('.json'));
      const results = await Promise.all(
        files.map(async (f) => {
          try {
            return JSON.parse(await fsp.readFile(path.join(FLOWS_DIR, f), 'utf-8'));
          } catch {
            return null;
          }
        })
      );
      return results.filter(Boolean);
    } catch {
      return [];
    }
  }

  async remove(id) {
    try {
      await fsp.unlink(flowPath(id));
      await this._cleanLogs(id);
      return true;
    } catch {
      return false;
    }
  }

  async toggleEnabled(id) {
    const flow = await this.get(id);
    if (!flow) return null;
    flow.enabled = !flow.enabled;
    return this.save(flow);
  }

  getRunning() {
    const result = {};
    for (const [flowId, data] of this._runningFlows) {
      result[flowId] = data.ptyId;
    }
    return result;
  }

  async getRunLog(flowId, timestamp) {
    try {
      return await fsp.readFile(logPath(flowId, timestamp), 'utf-8');
    } catch {
      return null;
    }
  }

  async _cleanLogs(flowId) {
    try {
      const files = (await fsp.readdir(LOGS_DIR)).filter((f) => f.startsWith(flowId + '_'));
      await Promise.all(files.map((f) => fsp.unlink(path.join(LOGS_DIR, f))));
    } catch {}
  }

  // --- Scheduling ---

  async _tick() {
    const now = new Date();
    const flows = await this.list();

    for (const flow of flows) {
      if (!flow.enabled) continue;
      if (this._runningFlows.has(flow.id)) continue;
      if (this._shouldRun(flow, now)) {
        this._execute(flow);
      }
    }
  }

  _shouldRun(flow, now) {
    const schedule = flow.schedule;
    if (!schedule) return false;

    // Interval-based scheduling
    if (schedule.type === 'interval') {
      const intervalMs = (schedule.intervalHours || 1) * 60 * 60 * 1000;
      if (!flow.runs || flow.runs.length === 0) return true;
      const lastRun = flow.runs[flow.runs.length - 1];
      const elapsed = now.getTime() - new Date(lastRun.timestamp).getTime();
      return elapsed >= intervalMs;
    }

    // Time-based scheduling
    if (!schedule.time) return false;

    const [hours, minutes] = schedule.time.split(':').map(Number);
    if (now.getHours() !== hours || now.getMinutes() !== minutes) return false;

    const day = now.getDay();
    if (schedule.type === 'weekdays' && (day === 0 || day === 6)) return false;
    if (schedule.type === 'custom' && schedule.days && !schedule.days.includes(day)) return false;

    const todayStr = now.toISOString().slice(0, 10);
    if (flow.runs && flow.runs.length > 0) {
      const lastRun = flow.runs[flow.runs.length - 1];
      if (lastRun.date === todayStr) return false;
    }

    return true;
  }

  // --- Execution ---

  _buildCommand(flow) {
    const escapedPrompt = flow.prompt.replace(/'/g, "'\\''");
    const agent = flow.agent || 'claude';
    const buildCmd = AGENT_COMMANDS[agent] || AGENT_COMMANDS.claude;
    return `${buildCmd(escapedPrompt)}; exit\n`;
  }

  _saveLog(flowId, runTimestamp, output) {
    ensureDir();
    try {
      fs.writeFileSync(logPath(flowId, runTimestamp), output, 'utf-8');
    } catch (e) {
      console.warn('Failed to save flow log:', e);
    }
  }

  _setupPtyListeners(proc, flow, ptyId, runTimestamp) {
    let outputBuffer = '';

    proc.onData((data) => {
      outputBuffer += data;
      this._sendToWindow('pty:data', { id: ptyId, data });
    });

    proc.onExit(({ exitCode }) => {
      this._ptyManager.processes.delete(ptyId);
      this._saveLog(flow.id, runTimestamp, outputBuffer);

      const status = exitCode === 0 ? 'success' : 'error';
      this._sendToWindow('pty:exit', { id: ptyId, exitCode });
      this._sendToWindow('flow:runComplete', { flowId: flow.id, ptyId, exitCode });

      this._recordRun(flow.id, status, runTimestamp);
      this._runningFlows.delete(flow.id);
    });
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
      this._runningFlows.set(flow.id, { ptyId, proc, output: '' });

      this._sendToWindow('flow:runStarted', {
        flowId: flow.id,
        ptyId,
        flowName: flow.name,
      });

      const cmd = this._buildCommand(flow);
      setTimeout(() => {
        this._ptyManager.write(ptyId, cmd);
      }, SHELL_INIT_DELAY_MS);
    } catch (err) {
      console.error('Flow execution failed:', err);
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
    if (!flow.runs) flow.runs = [];
    flow.runs.push({
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      logTimestamp: runTimestamp,
      status,
    });
    if (flow.runs.length > MAX_RUN_HISTORY) {
      flow.runs = flow.runs.slice(-MAX_RUN_HISTORY);
    }
    await this.save(flow);
  }
}

module.exports = new FlowManager();
