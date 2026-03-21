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

class PtyManager {
  constructor() {
    this.processes = new Map();
  }

  create({ id, cwd, cols, rows }) {
    const shell = process.env.SHELL || (os.platform() === 'win32' ? 'powershell.exe' : '/bin/zsh');
    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || os.homedir(),
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    this.processes.set(id, proc);
    return proc;
  }

  async getCwd(id) {
    const proc = this.processes.get(id);
    if (!proc) return null;
    try {
      const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(proc.pid), '-d', 'cwd', '-Fn'], {
        encoding: 'utf-8',
        timeout: CWD_TIMEOUT_MS,
      });
      const match = stdout.match(/^n(.+)$/m);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  write(id, data) {
    const proc = this.processes.get(id);
    if (proc) proc.write(data);
  }

  resize(id, cols, rows) {
    const proc = this.processes.get(id);
    if (proc) proc.resize(cols, rows);
  }

  kill(id) {
    const proc = this.processes.get(id);
    if (proc) {
      proc.kill();
      this.processes.delete(id);
    }
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

  async _checkAgent(id, proc) {
    try {
      const { stdout } = await execFileAsync('pgrep', ['-P', String(proc.pid)], {
        encoding: 'utf8',
        timeout: EXEC_TIMEOUT_MS,
      });
      const childPids = stdout.trim().split('\n').filter(Boolean).map((p) => p.trim());
      if (childPids.length === 0) return null;

      const { stdout: psOut } = await execFileAsync('ps', ['-o', 'args=', '-p', childPids.join(',')], {
        encoding: 'utf8',
        timeout: EXEC_TIMEOUT_MS,
      });
      const lower = psOut.toLowerCase();
      for (const [pattern, name] of KNOWN_AGENTS) {
        if (lower.includes(pattern)) return name;
      }
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
