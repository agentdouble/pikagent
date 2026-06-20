const fsp = require('fs/promises');
const path = require('path');
const { LOOP_RUNS_DIR, loopNodeLogPath, loopNodeRunPath } = require('./paths');
const { readJson, writeJson } = require('./fs-utils');

function isPidAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

function activeLoopNodeRun(run, { isAlive = isPidAlive } = {}) {
  if (!run || run.status !== 'running') return null;
  if (!isAlive(run.pid)) return null;
  return run;
}

async function readLoopNodeRun(boardId, nodeId) {
  return readJson(loopNodeRunPath(boardId, nodeId));
}

async function readActiveLoopNodeRun(boardId, nodeId) {
  return activeLoopNodeRun(await readLoopNodeRun(boardId, nodeId));
}

async function readActiveLoopNodeRuns({ isAlive = isPidAlive } = {}) {
  const runs = [];
  let boards = [];
  try {
    boards = await fsp.readdir(LOOP_RUNS_DIR, { withFileTypes: true });
  } catch (err) {
    if (err?.code === 'ENOENT') return runs;
    throw err;
  }

  for (const board of boards) {
    if (!board.isDirectory()) continue;
    const boardId = board.name;
    const boardDir = path.join(LOOP_RUNS_DIR, boardId);
    let files = [];
    try {
      files = await fsp.readdir(boardDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith('.json')) continue;
      const nodeId = path.basename(file.name, '.json');
      const run = activeLoopNodeRun(await readJson(path.join(boardDir, file.name)), { isAlive });
      if (!run) continue;
      runs.push({
        ...run,
        boardId: run.boardId || boardId,
        nodeId: run.nodeId || nodeId,
      });
    }
  }

  return runs;
}

async function beginLoopNodeRun({
  boardId = 'main',
  nodeId,
  pid,
  runTimestamp,
  logFile,
  source = 'hook',
}) {
  if (!nodeId) return null;
  const now = new Date().toISOString();
  const data = {
    boardId,
    nodeId,
    status: 'running',
    pid: Number(pid) || null,
    source,
    runTimestamp: runTimestamp || '',
    logFile: logFile || loopNodeLogPath(boardId, nodeId),
    startedAt: now,
    updatedAt: now,
  };
  await writeLoopNodeRun(boardId, nodeId, data);
  return data;
}

async function finishLoopNodeRun({
  boardId = 'main',
  nodeId,
  status = 'stopped',
  error,
}) {
  if (!nodeId) return null;
  const previous = await readLoopNodeRun(boardId, nodeId);
  const now = new Date().toISOString();
  const data = {
    ...(previous || { boardId, nodeId }),
    boardId,
    nodeId,
    status,
    stoppedAt: now,
    updatedAt: now,
  };
  if (error) data.error = error;
  await writeLoopNodeRun(boardId, nodeId, data);
  return data;
}

async function writeLoopNodeRun(boardId, nodeId, data) {
  const file = loopNodeRunPath(boardId, nodeId);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await writeJson(file, data);
}

module.exports = {
  activeLoopNodeRun,
  beginLoopNodeRun,
  finishLoopNodeRun,
  isPidAlive,
  readActiveLoopNodeRun,
  readActiveLoopNodeRuns,
  readLoopNodeRun,
};
