const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const FLOWS_DIR = path.join(BASE_DIR, 'flows');

function ensureDir() {
  fs.mkdirSync(FLOWS_DIR, { recursive: true });
}

function flowPath(id) {
  return path.join(FLOWS_DIR, `${id}.json`);
}

class FlowManager {
  constructor() {
    this._timer = null;
    this._getWindow = null;
    this._ptyManager = null;
    this._runningFlows = new Map(); // flowId -> { ptyId, proc }
  }

  start(getWindow, ptyManager) {
    this._getWindow = getWindow;
    this._ptyManager = ptyManager;
    // Check every 60 seconds
    this._timer = setInterval(() => this._tick(), 60_000);
    // Also check immediately on start
    this._tick();
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // CRUD

  save(flow) {
    ensureDir();
    const existing = this.get(flow.id);
    const data = {
      ...flow,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (!data.runs) data.runs = [];
    if (!data.enabled) data.enabled = true;
    fs.writeFileSync(flowPath(flow.id), JSON.stringify(data, null, 2), 'utf-8');
    return data;
  }

  get(id) {
    try {
      return JSON.parse(fs.readFileSync(flowPath(id), 'utf-8'));
    } catch {
      return null;
    }
  }

  list() {
    ensureDir();
    try {
      const files = fs.readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.json'));
      return files
        .map((f) => {
          try {
            return JSON.parse(fs.readFileSync(path.join(FLOWS_DIR, f), 'utf-8'));
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  remove(id) {
    try {
      fs.unlinkSync(flowPath(id));
      return true;
    } catch {
      return false;
    }
  }

  toggleEnabled(id) {
    const flow = this.get(id);
    if (!flow) return null;
    flow.enabled = !flow.enabled;
    return this.save(flow);
  }

  // Scheduling

  _tick() {
    const now = new Date();
    const flows = this.list();

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
    if (!schedule || !schedule.time) return false;

    const [hours, minutes] = schedule.time.split(':').map(Number);
    const currentH = now.getHours();
    const currentM = now.getMinutes();

    // Only trigger within the exact minute
    if (currentH !== hours || currentM !== minutes) return false;

    // Check day of week
    const day = now.getDay(); // 0=Sunday
    if (schedule.type === 'weekdays' && (day === 0 || day === 6)) return false;
    if (schedule.type === 'custom' && schedule.days && !schedule.days.includes(day)) return false;

    // Check if already ran today
    const todayStr = now.toISOString().slice(0, 10);
    if (flow.runs && flow.runs.length > 0) {
      const lastRun = flow.runs[flow.runs.length - 1];
      if (lastRun.date === todayStr) return false;
    }

    return true;
  }

  _execute(flow) {
    if (!this._ptyManager) return;

    const ptyId = `flow-${flow.id}-${Date.now()}`;
    const cwd = flow.cwd || os.homedir();
    const win = this._getWindow?.();

    try {
      const proc = this._ptyManager.create({
        id: ptyId,
        cwd,
        cols: 120,
        rows: 30,
      });

      // Forward PTY data to renderer
      proc.onData((data) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('pty:data', { id: ptyId, data });
        }
      });

      proc.onExit(({ exitCode }) => {
        this._ptyManager.processes.delete(ptyId);
        if (win && !win.isDestroyed()) {
          win.webContents.send('pty:exit', { id: ptyId, exitCode });
          win.webContents.send('flow:runComplete', {
            flowId: flow.id,
            ptyId,
            exitCode,
          });
        }
        this._recordRun(flow.id, exitCode === 0 ? 'success' : 'error');
        this._runningFlows.delete(flow.id);
      });

      this._runningFlows.set(flow.id, { ptyId, proc });

      // Notify renderer that a flow started
      if (win && !win.isDestroyed()) {
        win.webContents.send('flow:runStarted', {
          flowId: flow.id,
          ptyId,
        });
      }

      // Build the prompt — escape single quotes for shell safety
      const escapedPrompt = flow.prompt.replace(/'/g, "'\\''");
      const cmd = `claude -p '${escapedPrompt}'\n`;

      // Small delay to let the shell initialize
      setTimeout(() => {
        this._ptyManager.write(ptyId, cmd);
      }, 500);
    } catch (err) {
      console.error('Flow execution failed:', err);
      this._recordRun(flow.id, 'error');
    }
  }

  runNow(id) {
    const flow = this.get(id);
    if (!flow) return false;
    if (this._runningFlows.has(id)) return false;
    this._execute(flow);
    return true;
  }

  _recordRun(flowId, status) {
    const flow = this.get(flowId);
    if (!flow) return;
    if (!flow.runs) flow.runs = [];
    flow.runs.push({
      date: new Date().toISOString().slice(0, 10),
      timestamp: new Date().toISOString(),
      status,
    });
    // Keep only last 7 runs
    if (flow.runs.length > 7) {
      flow.runs = flow.runs.slice(-7);
    }
    this.save(flow);
  }
}

module.exports = new FlowManager();
