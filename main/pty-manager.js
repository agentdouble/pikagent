const os = require('os');
const pty = require('node-pty');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const KNOWN_AGENTS = [
  ['claude', 'Claude'],
  ['codex', 'Codex'],
  ['opencode', 'OpenCode'],
];

const EXEC_TIMEOUT_MS = 1000;
const CWD_TIMEOUT_MS = 2000;
const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const TERM = 'xterm-256color';
const DEFAULT_SHELL =
  process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');

class PtyManager {
  constructor() {
    this.processes = new Map();
  }

  _getProc(id) {
    return this.processes.get(id) ?? null;
  }

  async _exec(cmd, args, timeout = EXEC_TIMEOUT_MS) {
    const { stdout } = await execFileAsync(cmd, args, {
      encoding: 'utf8',
      timeout,
    });
    return stdout;
  }

  create({ id, cwd, cols, rows }) {
    const proc = pty.spawn(DEFAULT_SHELL, [], {
      name: TERM,
      cols: cols || DEFAULT_COLS,
      rows: rows || DEFAULT_ROWS,
      cwd: cwd || os.homedir(),
      env: { ...process.env, TERM },
    });
    this.processes.set(id, proc);
    return proc;
  }

  async getCwd(id) {
    const proc = this._getProc(id);
    if (!proc) return null;
    try {
      const out = await this._exec(
        'lsof',
        ['-a', '-p', String(proc.pid), '-d', 'cwd', '-Fn'],
        CWD_TIMEOUT_MS,
      );
      const match = out.match(/^n(.+)$/m);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  write(id, data) {
    this._getProc(id)?.write(data);
  }

  resize(id, cols, rows) {
    this._getProc(id)?.resize(cols, rows);
  }

  kill(id) {
    const proc = this._getProc(id);
    if (!proc) return;
    proc.kill();
    this.processes.delete(id);
  }

  async checkAgents() {
    const agents = {};
    const checks = [];

    for (const [id, proc] of this.processes) {
      checks.push(this._checkAgent(id, proc).then((result) => {
        if (result) agents[id] = result;
      }));
    }

    await Promise.all(checks);
    return agents;
  }

  async _getChildPids(pid) {
    const out = await this._exec('pgrep', ['-P', String(pid)]);
    return out.trim().split('\n').filter(Boolean).map((p) => p.trim());
  }

  _matchAgent(psOutput) {
    const lower = psOutput.toLowerCase();
    for (const [pattern, name] of KNOWN_AGENTS) {
      if (lower.includes(pattern)) return name;
    }
    return null;
  }

  async _checkAgent(id, proc) {
    try {
      const childPids = await this._getChildPids(proc.pid);
      if (childPids.length === 0) return null;

      const psOut = await this._exec('ps', ['-o', 'args=', '-p', childPids.join(',')]);
      return this._matchAgent(psOut);
    } catch {}
    return null;
  }

  killAll() {
    for (const proc of this.processes.values()) {
      proc.kill();
    }
    this.processes.clear();
  }
}

module.exports = PtyManager;
