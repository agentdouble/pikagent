const fsp = require('fs/promises');
const path = require('path');
const { setTimeout: delay } = require('timers/promises');
const { readActiveLoopNodeRuns } = require('./loop-run-state');
const {
  listProcesses,
  parsePosixPsOutput,
  readProcessCwd: readPlatformProcessCwd,
} = require('./process-helpers');

const LOG_READ_BYTES = 256 * 1024;
const LOG_TAIL_LINES = 90;
const KILL_GRACE_MS = 1200;

async function list() {
  const errors = [];
  let rows = [];

  try {
    rows = await runPs();
  } catch (err) {
    errors.push(`ps failed: ${String(err)}`);
  }

  const drafts = groupAgentProcesses(rows);
  attachLoopRunsToDrafts(drafts, await listActiveLoopRuns(errors));
  const agents = await Promise.all(drafts.map((draft) => hydrateAgent(draft, errors)));

  return {
    generatedAt: new Date().toISOString(),
    agents: agents.sort(compareAgents),
    errors,
  };
}

async function listActiveLoopRuns(errors) {
  try {
    return await readActiveLoopNodeRuns();
  } catch (err) {
    errors.push(`loop run scan failed: ${String(err)}`);
    return [];
  }
}

async function kill(agentId) {
  const rows = await runPs();
  const draft = groupAgentProcesses(rows).find((agent) => agent.key === agentId);
  if (!draft) throw new Error(`Headless agent not found or already stopped: ${agentId}`);

  const rootPids = uniqueNumbers(draft.pids);
  const descendantPids = collectDescendantPids(rows, rootPids);
  const targetedPids = uniqueNumbers([...descendantPids.reverse(), ...rootPids])
    .filter((pid) => pid > 0 && pid !== process.pid);
  const errors = [];

  for (const pid of targetedPids) {
    const error = sendSignal(pid, 'SIGTERM');
    if (error) errors.push(error);
  }

  await delay(KILL_GRACE_MS);

  const stillAlive = targetedPids.filter((pid) => isProcessAlive(pid));
  for (const pid of stillAlive) {
    const error = sendSignal(pid, 'SIGKILL');
    if (error) errors.push(error);
  }

  await delay(100);

  return {
    agentId,
    targetedPids,
    remainingPids: targetedPids.filter((pid) => isProcessAlive(pid)),
    errors,
  };
}

async function runPs() {
  return listProcesses();
}

const parsePsOutput = parsePosixPsOutput;

function groupAgentProcesses(rows) {
  const groups = new Map();
  const headlessRows = rows.filter((row) => isHeadlessAgentCommand(row.command));
  const headlessByPid = new Map(headlessRows.map((row) => [row.pid, row]));

  for (const row of headlessRows) {
    const cwd = extractArg(row.command, '--cwd') || extractArg(row.command, '--cd');
    const logFile = extractArg(row.command, '--log-file');
    const lastMessageFile = extractArg(row.command, '--output-last-message');
    const derivedLog = logFile || deriveLogFile(lastMessageFile, cwd);
    const rootPid = findHeadlessRootPid(row, headlessByPid);
    const key = derivedLog || cwd || `${detectAgent(row.command)}:${rootPid}`;
    const helper = row.command.includes('run_headless_agent.py');

    const existing = groups.get(key);
    if (existing) {
      existing.pids.push(row.pid);
      existing.parentPids.push(row.ppid);
      if (helper && !existing.helper) {
        existing.command = row.command;
        existing.helper = true;
      }
      existing.cwd ||= cwd;
      existing.logFile ||= derivedLog;
      existing.lastMessageFile ||= lastMessageFile;
      existing.startedAt = minDate(existing.startedAt, row.startedAt);
      continue;
    }

    groups.set(key, {
      key,
      agent: detectAgent(row.command),
      pids: [row.pid],
      parentPids: [row.ppid],
      command: row.command,
      cwd,
      logFile: derivedLog,
      lastMessageFile,
      startedAt: row.startedAt,
      helper,
    });
  }

  return [...groups.values()];
}

function attachLoopRunsToDrafts(drafts, runs) {
  const runsByPid = new Map();
  for (const run of runs || []) {
    const pid = Number(run?.pid);
    if (Number.isInteger(pid) && pid > 0) runsByPid.set(pid, run);
  }
  for (const draft of drafts || []) attachLoopRunToDraft(draft, runsByPid);
  return drafts;
}

function attachLoopRunToDraft(draft, runsByPid) {
  const run = uniqueNumbers(draft?.pids || [])
    .map((pid) => runsByPid.get(pid))
    .find(Boolean);
  if (!run) return draft;

  draft.logFile ||= run.logFile;
  draft.loopRun = {
    boardId: run.boardId,
    nodeId: run.nodeId,
    source: run.source,
  };
  return draft;
}

function findHeadlessRootPid(row, headlessByPid) {
  let current = row;
  const seen = new Set();
  while (headlessByPid.has(current.ppid) && !seen.has(current.ppid)) {
    seen.add(current.pid);
    current = headlessByPid.get(current.ppid);
  }
  return current.pid;
}

function isHeadlessAgentCommand(command) {
  const text = String(command || '');
  if (text.includes('SkyComputerUseClient')) return false;
  if (text.includes('agent-monitor')) return false;
  if (/\bps\s+-axo\b/.test(text)) return false;
  if (/\b(rg|grep|egrep)\b/.test(text)) return false;
  if (text.includes('run_headless_agent.py')) return true;
  if (/\bcodex\b/.test(text) && /\bexec\b/.test(text)) return true;
  if (/\bclaude\b/.test(text) && /(?:\s-p\s|\s--print\b)/.test(text)) return true;
  if (/\bopencode\b/.test(text) && /(?:\s-p\s|\s--print\b)/.test(text)) return true;
  return false;
}

function detectAgent(command) {
  const explicit = extractArg(command, '--agent');
  if (explicit === 'codex' || explicit === 'claude' || explicit === 'opencode') return explicit;
  if (/\bcodex\b/.test(command)) return 'codex';
  if (/\bclaude\b/.test(command)) return 'claude';
  if (/\bopencode\b/.test(command)) return 'opencode';
  return 'unknown';
}

function extractArg(command, name) {
  const escaped = escapeRegExp(name);
  const match = String(command || '').match(new RegExp(`(?:^|\\s)${escaped}(?:=|\\s+)(\\S+)`));
  return match?.[1]?.replace(/^['"]|['"]$/g, '');
}

function deriveLogFile(lastMessageFile, cwd) {
  if (lastMessageFile) return path.join(path.dirname(lastMessageFile), 'agent.log');

  const worktreeName = cwd ? deriveWorktreeName(cwd) : undefined;
  if (!cwd || !worktreeName) return undefined;
  const parts = cwd.split(path.sep);
  const worktreeIndex = parts.lastIndexOf('worktree');
  if (worktreeIndex <= 0) return undefined;
  const base = parts.slice(0, worktreeIndex).join(path.sep) || path.sep;
  return path.join(base, '.orch', 'headless-agents', worktreeName, 'agent.log');
}

async function hydrateAgent(draft, errors) {
  const cwd = draft.cwd || await readProcessCwd(draft.pids[0], errors);
  const log = draft.logFile ? await readLogInfo(draft.logFile, errors) : null;
  const metadata = parseMetadata(log?.text || '');
  const worktreeName = metadata.worktreeName
    || (cwd ? deriveWorktreeName(cwd) : undefined)
    || (draft.logFile ? path.basename(path.dirname(draft.logFile)) : undefined);

  return {
    id: draft.key,
    agent: draft.agent,
    status: 'running',
    pids: uniqueNumbers(draft.pids),
    parentPids: uniqueNumbers(draft.parentPids),
    command: draft.command,
    cwd,
    logFile: draft.logFile,
    lastMessageFile: draft.lastMessageFile,
    worktreeName,
    projectId: metadata.projectId,
    taskId: metadata.taskId,
    title: metadata.title,
    startedAt: draft.startedAt,
    logUpdatedAt: log?.updatedAt,
    lastLogLines: log?.lines || [],
    loopBoardId: draft.loopRun?.boardId,
    loopNodeId: draft.loopRun?.nodeId,
    loopSource: draft.loopRun?.source,
    source: 'headless',
  };
}

async function readProcessCwd(pid, errors) {
  if (!pid) return undefined;
  try {
    return await readPlatformProcessCwd(pid);
  } catch (err) {
    if (err?.code !== 1) errors.push(`cwd read failed for PID ${pid}: ${String(err)}`);
    return undefined;
  }
}

async function readLogInfo(filePath, errors) {
  try {
    const stat = await fsp.stat(filePath);
    const start = Math.max(0, stat.size - LOG_READ_BYTES);
    const handle = await fsp.open(filePath, 'r');
    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      const text = buffer.toString('utf-8');
      return {
        text,
        lines: text.split(/\r?\n/).filter(Boolean).slice(-LOG_TAIL_LINES),
        updatedAt: stat.mtime.toISOString(),
      };
    } finally {
      await handle.close();
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') errors.push(`log read failed for ${filePath}: ${String(err)}`);
    return null;
  }
}

function parseMetadata(text) {
  return {
    projectId: findLineValue(text, 'project_id'),
    taskId: findLineValue(text, 'task_id'),
    title: findLineValue(text, 'title'),
    worktreeName: findLineValue(text, 'worktree_name'),
  };
}

function findLineValue(text, key) {
  const match = String(text || '').match(new RegExp(`^${escapeRegExp(key)}:\\s*(.+)$`, 'm'));
  return match?.[1]?.trim();
}

function deriveWorktreeName(cwd) {
  const parts = String(cwd || '').split(path.sep).filter(Boolean);
  const index = parts.lastIndexOf('worktree');
  if (index >= 0 && parts[index + 1]) return parts[index + 1];
  return path.basename(cwd);
}

function compareAgents(a, b) {
  const aTime = a.startedAt ? new Date(a.startedAt).getTime() : 0;
  const bTime = b.startedAt ? new Date(b.startedAt).getTime() : 0;
  return bTime - aTime;
}

function collectDescendantPids(rows, rootPids) {
  const childrenByParent = new Map();
  for (const row of rows) {
    const children = childrenByParent.get(row.ppid) || [];
    children.push(row.pid);
    childrenByParent.set(row.ppid, children);
  }

  const descendants = [];
  const seen = new Set(rootPids);
  const stack = [...rootPids];

  while (stack.length) {
    const pid = stack.pop();
    for (const childPid of childrenByParent.get(pid) || []) {
      if (seen.has(childPid)) continue;
      seen.add(childPid);
      descendants.push(childPid);
      stack.push(childPid);
    }
  }

  return descendants;
}

function sendSignal(pid, signal) {
  try {
    process.kill(pid, signal);
    return null;
  } catch (err) {
    if (err?.code === 'ESRCH') return null;
    return `kill ${signal} ${pid} failed: ${err.message}`;
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function minDate(a, b) {
  if (!a) return b;
  if (!b) return a;
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function uniqueNumbers(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  kill,
  list,
};

module.exports._internals = {
  attachLoopRunToDraft,
  attachLoopRunsToDrafts,
  collectDescendantPids,
  deriveLogFile,
  detectAgent,
  extractArg,
  findHeadlessRootPid,
  groupAgentProcesses,
  isHeadlessAgentCommand,
  parseMetadata,
  parsePsOutput,
};
