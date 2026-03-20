const os = require('os');
const pty = require('node-pty');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

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
        timeout: 2000,
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
        timeout: 1000,
      });
      const childPids = stdout.trim().split('\n').filter(Boolean);

      for (const childPid of childPids) {
        try {
          const { stdout: args } = await execFileAsync('ps', ['-o', 'args=', '-p', childPid.trim()], {
            encoding: 'utf8',
            timeout: 1000,
          });
          const lower = args.trim().toLowerCase();
          if (lower.includes('claude')) return 'Claude';
          if (lower.includes('codex')) return 'Codex';
          if (lower.includes('opencode')) return 'OpenCode';
        } catch {}
      }
    } catch {}
    return null;
  }

  killAll() {
    for (const [id, proc] of this.processes) {
      proc.kill();
    }
    this.processes.clear();
  }
}

module.exports = PtyManager;
