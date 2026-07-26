const os = require('os');
const fs = require('fs');
const pty = require('node-pty');
const { execFileAsync } = require('./command-utils');
const { createLogger } = require('./logger');

const log = createLogger('pty-manager');

function safeCwd(cwd) {
  if (cwd) {
    try {
      if (fs.statSync(cwd).isDirectory()) return cwd;
      log.warn(`cwd is not a directory, falling back to homedir: ${cwd}`);
    } catch {
      log.warn(`cwd does not exist, falling back to homedir: ${cwd}`);
    }
  }
  return os.homedir();
}
const {
  EXEC_TIMEOUT_MS,
  CWD_TIMEOUT_MS,
  DEFAULT_COLS,
  DEFAULT_ROWS,
  TERM,
  DEFAULT_SHELL,
  matchAgent,
  parseChildPids,
  parseCwdFromLsof,
  getShellArgs,
  consumeCwdOsc,
} = require('./pty-helpers');

class PtyManager {
  constructor({ platform = process.platform, shell = DEFAULT_SHELL } = {}) {
    this.platform = platform;
    this.shell = shell;
    this.processes = new Map();
    this.cwdById = new Map();
    this.cwdOutputBuffers = new Map();
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
    const initialCwd = safeCwd(cwd);
    const spawnOpts = {
      name: TERM,
      cols: cols || DEFAULT_COLS,
      rows: rows || DEFAULT_ROWS,
      cwd: initialCwd,
      env: { ...process.env, TERM },
    };
    const shellArgs = getShellArgs(this.shell, this.platform);
    let proc;
    try {
      proc = pty.spawn(this.shell, shellArgs, spawnOpts);
    } catch (err) {
      log.error(`spawn failed (shell=${this.shell}, cwd=${spawnOpts.cwd}), retrying from homedir`, err);
      spawnOpts.cwd = os.homedir();
      proc = pty.spawn(this.shell, shellArgs, spawnOpts);
    }
    this.processes.set(id, proc);
    this.cwdById.set(id, spawnOpts.cwd);
    proc.onData((data) => this._captureCwd(id, data));
    proc.onExit(() => this._forgetProcess(id));
    return proc;
  }

  _captureCwd(id, data) {
    const result = consumeCwdOsc(this.cwdOutputBuffers.get(id), data);
    this.cwdOutputBuffers.set(id, result.buffer);
    if (result.cwd) this.cwdById.set(id, result.cwd);
  }

  _forgetProcess(id) {
    this.processes.delete(id);
    this.cwdById.delete(id);
    this.cwdOutputBuffers.delete(id);
  }

  // Alias matching channel suffix (pty:getcwd → getcwd)
  getcwd(id) { return this.getCwd(id); }

  async getCwd(id) {
    const proc = this._getProc(id);
    if (!proc) return null;
    if (this.platform === 'win32') return this.cwdById.get(id) || null;
    try {
      const out = await this._exec(
        'lsof',
        ['-a', '-p', String(proc.pid), '-d', 'cwd', '-Fn'],
        CWD_TIMEOUT_MS,
      );
      return parseCwdFromLsof(out);
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
    // Kill the entire process group to clean up child processes (agents)
    try { process.kill(-proc.pid, 'SIGTERM'); } catch {}
    proc.kill();
    this._forgetProcess(id);
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
    try {
      const out = await this._exec('pgrep', ['-P', String(pid)]);
      return parseChildPids(out);
    } catch (err) {
      if (err?.code === 1) return [];
      throw err;
    }
  }

  async _checkAgent(id, proc) {
    try {
      const childPids = await this._getChildPids(proc.pid);
      if (childPids.length === 0) return null;

      const psOut = await this._exec('ps', ['-o', 'args=', '-p', childPids.join(',')]);
      return matchAgent(psOut);
    } catch (err) { log.warn('_checkAgent failed', err); }
    return null;
  }

  killAll() {
    for (const proc of this.processes.values()) {
      try { process.kill(-proc.pid, 'SIGTERM'); } catch {}
      proc.kill();
    }
    this.processes.clear();
    this.cwdById.clear();
    this.cwdOutputBuffers.clear();
  }

  cleanup() {
    this.killAll();
  }
}

module.exports = PtyManager;
