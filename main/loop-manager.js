const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { LOOP_FILE, LOOPS_DIR, loopBoardPath, loopNodeLogPath } = require('./paths');
const { ensureDirOnce, readJson, writeJson } = require('./fs-utils');
const { buildFlowCommand } = require('./flow-helpers');
const {
  isLinkTriggeredNode,
  linkedRunnableNodes,
  shouldTriggerLinkedTargets,
} = require('./loop-link-helpers');
const {
  finishLoopNodeRun,
  readActiveLoopNodeRun,
} = require('./loop-run-state');
const { generateId } = require('../shared/id-utils');

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

  async list() {
    await ensureLoopsDir();
    const loops = await this._readAllLoops();
    return loops.map(toLoopSummary);
  }

  async get(boardId = 'main') {
    await ensureLoopsDir();
    const resolvedId = sanitizeLoopId(boardId) || 'main';
    const loop = await readJson(loopBoardPath(resolvedId));
    return normalizeLoop(loop || (resolvedId === 'main' ? DEFAULT_LOOP : { ...DEFAULT_LOOP, id: resolvedId }));
  }

  async save(loop) {
    const loopId = sanitizeLoopId(loop?.id) || 'main';
    const existing = await this.get(loopId);
    const now = new Date().toISOString();
    const data = normalizeLoop({
      ...loop,
      id: loopId,
      name: String(loop?.name || '').trim() || 'Boucles',
      createdAt: existing.createdAt || now,
      updatedAt: now,
    });
    await ensureLoopsDir();
    await writeJson(loopBoardPath(data.id), data);
    return data;
  }

  async create(name = '') {
    const now = new Date().toISOString();
    const loop = normalizeLoop({
      ...DEFAULT_LOOP,
      id: generateId('board'),
      name: String(name || '').trim() || 'Nouveau board',
      createdAt: now,
      updatedAt: now,
    });
    await ensureLoopsDir();
    await writeJson(loopBoardPath(loop.id), loop);
    return loop;
  }

  async delete(boardId) {
    const resolvedId = sanitizeLoopId(boardId);
    if (!resolvedId) throw new Error('Loop board id is required');

    const loops = await this._readAllLoops();
    if (loops.length <= 1) throw new Error('Cannot delete the last loop board');

    const loop = loops.find((item) => item.id === resolvedId);
    if (!loop) throw new Error(`Loop board not found: ${resolvedId}`);

    await Promise.all(loop.nodes.map((node) => this.stopNode({ boardId: resolvedId, nodeId: node.id })));
    await fsp.unlink(loopBoardPath(resolvedId));
    const remaining = (await this._readAllLoops()).filter((item) => item.id !== resolvedId);
    return remaining[0] || DEFAULT_LOOP;
  }

  async runNode(arg, context = {}) {
    const { boardId, nodeId } = normalizeNodeArg(arg);
    const key = runningKey(boardId, nodeId);
    const existing = this.running.get(key);
    if (existing) return this._toProcess(boardId, nodeId, existing);
    const externalRun = await readActiveLoopNodeRun(boardId, nodeId);
    if (externalRun) return this._toExternalProcess(boardId, nodeId, externalRun);

    const loop = await this.get(boardId);
    const node = loop.nodes.find((item) => item.id === nodeId);
    if (!node) throw new Error(`Loop node not found: ${nodeId}`);
    if (node.type === 'display') throw new Error(`Display node is visual only: ${node.title}`);
    if (!node.enabled) throw new Error(`Loop node is disabled: ${node.title}`);

    const command = buildNodeCommand(node);
    const cwd = safeCwd(node.cwd);
    const logFile = loopNodeLogPath(boardId, node.id);
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
      chainVisited: normalizeVisited(context.visited, node.id),
    };
    this.running.set(key, running);

    child.stdout?.on('data', (data) => appendLog(logFile, data.toString()));
    child.stderr?.on('data', (data) => appendLog(logFile, data.toString()));
    child.on('error', (err) => {
      running.error = err.message;
      appendLog(logFile, `[pickagent-loop] failed: ${err.message}\n`);
    });
    child.on('close', (code, signal) => {
      appendLog(logFile, `[pickagent-loop] stopped code=${code ?? 'null'} signal=${signal ?? 'null'}\n`);
      this.running.delete(key);
      if (shouldTriggerLinkedTargets(code, signal)) {
        void this._triggerLinkedTargets(boardId, node.id, running.chainVisited);
      }
    });

    return this._toProcess(boardId, node.id, running);
  }

  async runPipeline(arg = 'main') {
    const boardId = normalizeBoardIdArg(arg);
    const loop = await this.get(boardId);
    const starters = pipelineStarterNodes(loop);
    const started = [];
    const skipped = [];

    for (const node of starters) {
      if (await this._isNodeRunning(boardId, node.id)) {
        skipped.push({ nodeId: node.id, reason: 'running' });
        continue;
      }
      try {
        started.push(await this.runNode(
          { boardId, nodeId: node.id },
          { trigger: 'pipeline' },
        ));
      } catch (err) {
        skipped.push({ nodeId: node.id, reason: 'error', error: err.message });
      }
    }

    return { boardId, started, skipped };
  }

  async stopNode(arg) {
    const { boardId, nodeId } = normalizeNodeArg(arg);
    const key = runningKey(boardId, nodeId);
    const running = this.running.get(key);
    if (!running) {
      const externalRun = await readActiveLoopNodeRun(boardId, nodeId);
      if (!externalRun) return this._stoppedProcess(boardId, nodeId);
      const error = stopExternalRun(externalRun);
      await finishLoopNodeRun({
        boardId,
        nodeId,
        status: error ? 'error' : 'stopped',
        error,
      });
      await appendLog(externalRun.logFile || loopNodeLogPath(boardId, nodeId), '[pickagent-loop] stop requested\n');
      return this._stoppedProcess(boardId, nodeId, error);
    }

    try {
      if (process.platform !== 'win32' && running.child.pid) {
        process.kill(-running.child.pid, 'SIGTERM');
      } else {
        running.child.kill('SIGTERM');
      }
    } catch (err) {
      running.error = err.message;
    }
    this.running.delete(key);
    await appendLog(running.logFile, '[pickagent-loop] stop requested\n');
    return this._stoppedProcess(boardId, nodeId, running.error);
  }

  async snapshot(boardId = 'main') {
    const resolvedId = sanitizeLoopId(boardId) || 'main';
    const loop = await this.get(resolvedId);
    const processes = await Promise.all(loop.nodes.map(async (node) => {
      const running = this.running.get(runningKey(resolvedId, node.id));
      if (running) return this._toProcess(resolvedId, node.id, running);
      const externalRun = await readActiveLoopNodeRun(resolvedId, node.id);
      return externalRun
        ? this._toExternalProcess(resolvedId, node.id, externalRun)
        : this._stoppedProcess(resolvedId, node.id);
    }));
    return {
      generatedAt: new Date().toISOString(),
      processes,
      errors: [],
    };
  }

  async getNodeLog(arg) {
    const { boardId, nodeId } = normalizeNodeArg(arg);
    try {
      return await fsp.readFile(loopNodeLogPath(boardId, nodeId), 'utf-8');
    } catch {
      return null;
    }
  }

  async cleanup() {
    await Promise.all([...this.running.keys()].map((key) => {
      const { boardId, nodeId } = parseRunningKey(key);
      return this.stopNode({ boardId, nodeId });
    }));
  }

  async _isNodeRunning(boardId, nodeId) {
    return this.running.has(runningKey(boardId, nodeId))
      || Boolean(await readActiveLoopNodeRun(boardId, nodeId));
  }

  async _triggerLinkedTargets(boardId, fromNodeId, visited) {
    const loop = await this.get(boardId);
    const baseVisited = normalizeVisited(visited, fromNodeId);
    const targets = linkedRunnableNodes(loop, fromNodeId, baseVisited);
    if (!targets.length) return [];

    const results = [];
    for (const target of targets) {
      await appendLog(loopNodeLogPath(boardId, fromNodeId), `[pickagent-loop] linked trigger ${target.title}\n`);
      const nextVisited = normalizeVisited(baseVisited, target.id);
      results.push(await this.runNode(
        { boardId, nodeId: target.id },
        { trigger: 'link', fromNodeId, visited: nextVisited },
      ));
    }
    return results;
  }

  async _readAllLoops() {
    await ensureLoopsDir();
    let files = [];
    try {
      files = (await fsp.readdir(LOOPS_DIR)).filter((file) => file.endsWith('.json'));
    } catch {
      return [normalizeLoop(DEFAULT_LOOP)];
    }

    const loops = (await Promise.all(files.map((file) => readJson(path.join(LOOPS_DIR, file)))))
      .filter(Boolean)
      .map((loop) => normalizeLoop(loop));
    if (!loops.length) return [normalizeLoop(DEFAULT_LOOP)];
    return loops.sort(compareLoops);
  }

  async _toProcess(boardId, nodeId, running) {
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

  async _toExternalProcess(boardId, nodeId, run) {
    const logFile = run.logFile || loopNodeLogPath(boardId, nodeId);
    return {
      nodeId,
      status: 'running',
      pid: run.pid,
      startedAt: run.startedAt,
      logFile,
      lastLogLines: await readLastLines(logFile),
      source: run.source || 'hook',
      external: true,
      error: run.error || undefined,
    };
  }

  async _stoppedProcess(boardId, nodeId, error) {
    return {
      nodeId,
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
      logFile: loopNodeLogPath(boardId, nodeId),
      lastLogLines: await readLastLines(loopNodeLogPath(boardId, nodeId)),
      error,
    };
  }
}

function toLoopSummary(loop) {
  return {
    id: loop.id,
    name: loop.name,
    nodeCount: loop.nodes.length,
    createdAt: loop.createdAt,
    updatedAt: loop.updatedAt,
  };
}

function compareLoops(a, b) {
  if (a.id === 'main') return -1;
  if (b.id === 'main') return 1;
  return String(a.name || '').localeCompare(String(b.name || ''), 'fr');
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

function sanitizeLoopId(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return /^[a-zA-Z0-9_-]+$/.test(trimmed) ? trimmed : '';
}

function normalizeNodeArg(arg) {
  if (typeof arg === 'string') return { boardId: 'main', nodeId: arg };
  return {
    boardId: sanitizeLoopId(arg?.boardId) || 'main',
    nodeId: stringValue(arg?.nodeId),
  };
}

function normalizeBoardIdArg(arg) {
  if (typeof arg === 'string') return sanitizeLoopId(arg) || 'main';
  return sanitizeLoopId(arg?.boardId) || 'main';
}

function runningKey(boardId, nodeId) {
  return `${boardId}::${nodeId}`;
}

function parseRunningKey(key) {
  const [boardId, ...rest] = String(key).split('::');
  return { boardId: boardId || 'main', nodeId: rest.join('::') };
}

function normalizeVisited(value, nodeId) {
  const visited = value instanceof Set ? new Set(value) : new Set(Array.isArray(value) ? value : []);
  if (nodeId) visited.add(nodeId);
  return visited;
}

function isRunnableNode(node) {
  return node?.enabled !== false
    && (node?.type === 'executable' || node?.type === 'agent');
}

function isPipelineStarterNode(node, incomingLinkTargetIds = new Set()) {
  return isRunnableNode(node)
    && !(node?.type === 'agent' && node.triggerType === 'link')
    && !incomingLinkTargetIds.has(node.id);
}

function incomingLinkTargetIds(loop) {
  if (!loop || !Array.isArray(loop.nodes) || !Array.isArray(loop.edges)) return new Set();
  const nodesById = new Map(loop.nodes.map((node) => [node.id, node]));
  const targetIds = new Set();
  for (const edge of loop.edges) {
    const source = nodesById.get(edge?.from);
    const target = nodesById.get(edge?.to);
    if (isRunnableNode(source) && isLinkTriggeredNode(target)) targetIds.add(target.id);
  }
  return targetIds;
}

function pipelineStarterNodes(loop) {
  if (!loop || !Array.isArray(loop.nodes)) return [];
  const incomingTargets = incomingLinkTargetIds(loop);
  return loop.nodes.filter((node) => isPipelineStarterNode(node, incomingTargets));
}

function stopExternalRun(run) {
  try {
    if (process.platform !== 'win32' && run.pid) {
      process.kill(-run.pid, 'SIGTERM');
    } else if (run.pid) {
      process.kill(run.pid, 'SIGTERM');
    }
    return null;
  } catch (err) {
    return err.message;
  }
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
  if (value === 'hook' || value === 'schedule' || value === 'link') return value;
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
  incomingLinkTargetIds,
  isPipelineStarterNode,
  isRunnableNode,
  normalizeNodeArg,
  normalizeBoardIdArg,
  normalizeLoop,
  normalizeNode,
  normalizeVisited,
  pipelineStarterNodes,
  runningKey,
  sanitizeLoopId,
  safeCwd,
  stopExternalRun,
};
