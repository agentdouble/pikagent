const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { LOOP_FILE, LOOPS_DIR, loopNodeLogPath } = require('./paths');
const { ensureDirOnce, readJson, writeJson } = require('./fs-utils');
const { buildFlowCommand } = require('./flow-helpers');

const LAST_LOG_LINES = 80;
const DEFAULT_SCHEDULE = { type: 'weekdays', time: '09:00' };
const DEFAULT_HOOK_TRIGGER = {
  type: 'hook',
  event: 'file.changed',
  provider: 'any',
  paths: [],
  debounceSeconds: 30,
};
const DEFAULT_LOOP = {
  id: 'main',
  name: 'Boucles',
  nodes: [],
  edges: [],
};

const ensureLoopsDir = ensureDirOnce(LOOPS_DIR);

class LoopManager {
  constructor() {
    this.running = new Map();
  }

  async get() {
    await ensureLoopsDir();
    const loop = await readJson(LOOP_FILE);
    return normalizeLoop(loop || DEFAULT_LOOP);
  }

  async save(loop) {
    const existing = await this.get();
    const now = new Date().toISOString();
    const data = normalizeLoop({
      ...loop,
      id: loop?.id || 'main',
      name: String(loop?.name || '').trim() || 'Boucles',
      createdAt: existing.createdAt || now,
      updatedAt: now,
    });
    await ensureLoopsDir();
    await writeJson(LOOP_FILE, data);
    return data;
  }

  async runNode(nodeId) {
    const existing = this.running.get(nodeId);
    if (existing) return this._toProcess(nodeId, existing);

    const loop = await this.get();
    const node = loop.nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error(`Loop node not found: ${nodeId}`);
    if (node.type === 'display') throw new Error(`Display node is visual only: ${node.title}`);
    if (!node.enabled) throw new Error(`Loop node is disabled: ${node.title}`);

    const command = buildNodeCommand(node);
    const cwd = safeCwd(node.cwd);
    const logFile = loopNodeLogPath(node.id);
    await appendLog(logFile, `\n[pickagent-loop] run ${node.title}\n`);
    await appendLog(logFile, buildRunHeader(node, cwd, command));

    const child = spawn(command, {
      cwd,
      shell: true,
      env: {
        ...process.env,
        PATH: buildPathEnv(),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });

    const running = {
      child,
      startedAt: new Date().toISOString(),
      logFile,
      error: null,
    };
    this.running.set(node.id, running);

    child.stdout?.on('data', (data) => appendLog(logFile, data.toString()));
    child.stderr?.on('data', (data) => appendLog(logFile, data.toString()));
    child.on('error', (err) => {
      running.error = err.message;
      appendLog(logFile, `[pickagent-loop] failed: ${err.message}\n`);
    });
    child.on('close', (code, signal) => {
      appendLog(
        logFile,
        `[pickagent-loop] stopped code=${code ?? 'null'} signal=${signal ?? 'null'}\n`,
      );
      this.running.delete(node.id);
    });

    return this._toProcess(node.id, running);
  }

  async stopNode(nodeId) {
    const running = this.running.get(nodeId);
    if (!running) return this._stoppedProcess(nodeId);

    try {
      if (process.platform !== 'win32' && running.child.pid) {
        process.kill(-running.child.pid, 'SIGTERM');
      } else {
        running.child.kill('SIGTERM');
      }
    } catch (err) {
      running.error = err.message;
    }
    this.running.delete(nodeId);
    await appendLog(running.logFile, '[pickagent-loop] stop requested\n');
    return this._stoppedProcess(nodeId, running.error);
  }

  async snapshot() {
    const loop = await this.get();
    const processes = await Promise.all(loop.nodes.map(async (node) => {
      const running = this.running.get(node.id);
      return running ? this._toProcess(node.id, running) : this._stoppedProcess(node.id);
    }));
    return {
      generatedAt: new Date().toISOString(),
      processes,
      errors: [],
    };
  }

  async getNodeLog(nodeId) {
    try {
      return await fsp.readFile(loopNodeLogPath(nodeId), 'utf-8');
    } catch {
      return null;
    }
  }

  async cleanup() {
    await Promise.all([...this.running.keys()].map((id) => this.stopNode(id)));
  }

  async _toProcess(nodeId, running) {
    return {
      nodeId,
      status: 'running',
      pid: running.child.pid,
      startedAt: running.startedAt,
      logFile: running.logFile,
      lastLogLines: await readLastLines(running.logFile),
      error: running.error || undefined,
    };
  }

  async _stoppedProcess(nodeId, error) {
    return {
      nodeId,
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
      logFile: loopNodeLogPath(nodeId),
      lastLogLines: await readLastLines(loopNodeLogPath(nodeId)),
      error,
    };
  }
}

function normalizeLoop(loop) {
  const now = new Date().toISOString();
  const nodes = (loop?.nodes || [])
    .map((node) => normalizeNode(node, now))
    .filter(Boolean);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (loop?.edges || []).filter((edge) =>
    edge?.id && nodeIds.has(edge.from) && nodeIds.has(edge.to)
  );
  return {
    ...DEFAULT_LOOP,
    ...loop,
    id: loop?.id || 'main',
    name: String(loop?.name || '').trim() || 'Boucles',
    nodes,
    edges,
  };
}

function normalizeNode(node, now) {
  const type = node?.type;
  if (type !== 'agent' && type !== 'executable' && type !== 'display') return null;
  const base = {
    id: stringValue(node.id, `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`),
    type,
    title: stringValue(node.title).trim() || defaultTitle(type),
    x: numberValue(node.x, 80),
    y: numberValue(node.y, 80),
    color: normalizeNodeColor(node.color),
    createdAt: stringValue(node.createdAt, now),
    updatedAt: stringValue(node.updatedAt, now),
  };

  if (type === 'display') {
    return {
      ...base,
      filePath: stringValue(node.filePath),
      description: stringValue(node.description, stringValue(node.note)),
    };
  }

  const runnable = {
    ...base,
    cwd: stringValue(node.cwd),
    enabled: node.enabled === undefined ? true : Boolean(node.enabled),
  };

  if (type === 'executable') {
    return {
      ...runnable,
      command: stringValue(node.command),
      persistent: Boolean(node.persistent || node.watcher),
    };
  }

  const triggerType = normalizeTriggerType(node.triggerType, node.hookTrigger);
  return {
    ...runnable,
    flowId: stringValue(node.flowId) || undefined,
    agent: normalizeAgent(node.agent),
    prompt: stringValue(node.prompt),
    schedule: normalizeSchedule(node.schedule),
    triggerType,
    hookTrigger: triggerType === 'hook' ? normalizeHookTrigger(node.hookTrigger) : undefined,
    dangerouslySkipPermissions: Boolean(node.dangerouslySkipPermissions),
  };
}

function buildNodeCommand(node) {
  if (node.type === 'display') {
    throw new Error(`Display node is visual only: ${node.title}`);
  }
  if (node.type === 'executable') {
    const command = String(node.command || '').trim();
    if (!command) throw new Error(`Executable node command is empty: ${node.title}`);
    return command;
  }
  return buildFlowCommand({
    id: node.flowId || node.id,
    name: node.title,
    prompt: node.prompt || '',
    agent: node.agent,
    cwd: node.cwd,
    schedule: node.schedule,
    triggerType: node.triggerType,
    hookTrigger: node.hookTrigger,
    dangerouslySkipPermissions: node.dangerouslySkipPermissions,
    enabled: true,
    runs: [],
  });
}

function buildRunHeader(node, cwd, command) {
  const mode = node.type === 'agent'
    ? 'agent'
    : node.type === 'executable' && node.persistent
      ? 'persistent watcher'
      : 'executable';
  return `[cwd] ${cwd}\n[mode] ${mode}\n[cmd] ${command.trim()}\n`;
}

function buildPathEnv() {
  return [
    path.join(os.homedir(), '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    process.env.PATH || '',
  ].join(path.delimiter);
}

function defaultTitle(type) {
  if (type === 'agent') return 'Agent';
  if (type === 'executable') return 'Executable';
  return 'Fichier';
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringValue(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function normalizeAgent(value) {
  return value === 'claude' || value === 'opencode' || value === 'codex' ? value : 'codex';
}

function normalizeNodeColor(value) {
  return ['default', 'blue', 'green', 'yellow', 'red', 'purple'].includes(value)
    ? value
    : undefined;
}

function normalizeSchedule(value) {
  if (!value || typeof value !== 'object') return DEFAULT_SCHEDULE;
  if (value.type === 'interval') {
    return { type: 'interval', intervalHours: positiveNumber(value.intervalHours, 1) };
  }
  if (value.type === 'daily' || value.type === 'weekdays') {
    return { type: value.type, time: stringValue(value.time, DEFAULT_SCHEDULE.time) };
  }
  if (value.type === 'custom') {
    return {
      type: 'custom',
      time: stringValue(value.time, DEFAULT_SCHEDULE.time),
      days: normalizeDays(value.days),
    };
  }
  return DEFAULT_SCHEDULE;
}

function normalizeTriggerType(value, hookTrigger) {
  if (value === 'hook' || value === 'schedule') return value;
  return hookTrigger ? 'hook' : 'schedule';
}

function normalizeHookTrigger(value) {
  if (!value || typeof value !== 'object') return DEFAULT_HOOK_TRIGGER;
  const rawPaths = Array.isArray(value.paths) ? value.paths : [];
  return {
    type: 'hook',
    event: stringValue(value.event, DEFAULT_HOOK_TRIGGER.event),
    provider: stringValue(value.provider, DEFAULT_HOOK_TRIGGER.provider),
    paths: rawPaths.filter((item) => typeof item === 'string' && item.trim().length > 0),
    debounceSeconds: Math.max(0, numberValue(value.debounceSeconds, DEFAULT_HOOK_TRIGGER.debounceSeconds)),
  };
}

function normalizeDays(value) {
  if (!Array.isArray(value)) return [1, 2, 3, 4, 5];
  const days = value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
  return [...new Set(days)].sort();
}

function positiveNumber(value, fallback) {
  return Math.max(1, numberValue(value, fallback));
}

function safeCwd(cwd) {
  if (cwd) {
    try {
      if (fs.statSync(cwd).isDirectory()) return cwd;
    } catch {}
  }
  return os.homedir();
}

async function appendLog(logFile, data) {
  try {
    await fsp.mkdir(path.dirname(logFile), { recursive: true });
    await fsp.appendFile(logFile, data, 'utf-8');
  } catch {}
}

async function readLastLines(file) {
  try {
    const raw = await fsp.readFile(file, 'utf-8');
    return raw.split(/\r?\n/).filter(Boolean).slice(-LAST_LOG_LINES);
  } catch {
    return [];
  }
}

const loopManager = new LoopManager();

module.exports = loopManager;
module.exports.LoopManager = LoopManager;
module.exports._internals = {
  buildNodeCommand,
  normalizeLoop,
  normalizeNode,
  safeCwd,
};
