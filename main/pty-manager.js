const os = require('os');
const pty = require('node-pty');
const { execSync } = require('child_process');

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

  getCwd(id) {
    const proc = this.processes.get(id);
    if (!proc) return null;
    try {
      // macOS: use lsof to resolve the cwd of the shell process
      const output = execSync(
        `lsof -a -p ${proc.pid} -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//'`,
        { encoding: 'utf-8', timeout: 2000 }
      ).trim();
      return output || null;
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

  killAll() {
    for (const [id, proc] of this.processes) {
      proc.kill();
    }
    this.processes.clear();
  }
}

module.exports = PtyManager;
