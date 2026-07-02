const fsp = require('fs/promises');
const path = require('path');
const {
  FLOWS_DIR,
  LOGS_DIR,
  LOOPS_DIR,
  LOOP_LOGS_DIR,
  CLAUDE_PROJECTS_DIR,
} = require('./paths');
const { readDirJson, listDirNames } = require('./fs-utils');
const { DEFAULT_DAYS } = require('./stats-helpers');
const { generateDateRange } = require('../shared/date-utils');
const {
  newTokenTotals,
  addTokens,
  parseTokenUsage,
  parseTextTokenUsageSessions,
  aggregateTokenData,
  buildTokenSessionRankings,
  accumulatePerDay,
  getFlowRuns,
  buildFlowMetrics,
  buildAgentMetrics,
  collectUniqueCwds,
} = require('./usage-helpers');
const { createLogger, trySafe } = require('./logger');

const log = createLogger('token-collector');

async function getAllFlows() {
  return readDirJson(FLOWS_DIR);
}

async function readProjectTokens(projDir, cutoffMs) {
  const totals = newTokenTotals();
  const perDayMap = {};

  const files = (await fsp.readdir(projDir)).filter((f) => f.endsWith('.jsonl'));
  for (const file of files) {
    let content;
    try { content = await fsp.readFile(path.join(projDir, file), 'utf-8'); } catch { continue; }

    for (const line of content.split('\n')) {
      const usage = parseTokenUsage(line, cutoffMs);
      if (!usage) continue;

      addTokens(totals, usage);
      accumulatePerDay(perDayMap, usage);
    }
  }

  return { totals, perDayMap };
}

async function collectProjectTokens(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  return trySafe(
    async () => {
      const projects = await listDirNames(CLAUDE_PROJECTS_DIR);
      return Promise.all(
        projects.map(async (proj) => {
          const data = await readProjectTokens(path.join(CLAUDE_PROJECTS_DIR, proj), cutoffMs);
          return { proj, ...data };
        })
      );
    },
    [],
    { log, label: 'collectProjectTokens' },
  );
}

async function listLogFiles(dirPath) {
  let entries;
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listLogFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.log')) {
      files.push(entryPath);
    }
  }
  return files;
}

async function buildLoopNodeIndex() {
  const loops = await readDirJson(LOOPS_DIR);
  const index = new Map();
  for (const loop of loops) {
    const boardId = loop?.id || 'main';
    const boardName = loop?.name || boardId;
    for (const node of loop?.nodes || []) {
      if (!node?.id) continue;
      index.set(`${boardId}:${node.id}`, {
        boardName,
        nodeTitle: node.title || node.id,
        nodeType: node.type || 'node',
      });
    }
  }
  return index;
}

function flowForLogFile(filePath, flows) {
  const base = path.basename(filePath, '.log');
  return flows
    .filter((flow) => base.startsWith(`${flow.id}_`))
    .sort((a, b) => b.id.length - a.id.length)[0] || null;
}

function loopLogMeta(filePath, loopNodeIndex) {
  const relative = path.relative(LOOP_LOGS_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  const parts = relative.split(path.sep);
  const boardId = parts.length > 1 ? parts[0] : 'main';
  const nodeId = path.basename(filePath, '.log');
  const node = loopNodeIndex.get(`${boardId}:${nodeId}`);
  const boardName = node?.boardName || (boardId === 'main' ? 'Boucles' : boardId);
  const nodeTitle = node?.nodeTitle || nodeId;

  return {
    label: `${boardName} / ${nodeTitle}`,
    source: 'Boucles',
    consumerKey: `loop:${boardId}:${nodeId}`,
    consumerType: node?.nodeType || 'node',
    logFile: filePath,
  };
}

function flowLogMeta(filePath, flows) {
  const relative = path.relative(LOGS_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;

  const flow = flowForLogFile(filePath, flows);
  const label = flow?.name ? `Flow / ${flow.name}` : `Flow / ${path.basename(filePath, '.log')}`;
  return {
    label,
    source: 'Flow',
    consumerKey: `flow:${flow?.id || path.basename(filePath, '.log')}`,
    consumerType: 'flow',
    logFile: filePath,
  };
}

async function readLogTokenSessions(filePath, meta, cutoffMs) {
  try {
    const stat = await fsp.stat(filePath);
    if (stat.mtimeMs < cutoffMs) return [];
    const content = await fsp.readFile(filePath, 'utf-8');
    return parseTextTokenUsageSessions(content, meta || {});
  } catch {
    return [];
  }
}

async function collectLogTokenSessions(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  return trySafe(
    async () => {
      const [flows, loopNodeIndex, loopLogs, flowLogs] = await Promise.all([
        getAllFlows(),
        buildLoopNodeIndex(),
        listLogFiles(LOOP_LOGS_DIR),
        listLogFiles(LOGS_DIR),
      ]);

      const loopJobs = loopLogs.map((filePath) =>
        readLogTokenSessions(filePath, loopLogMeta(filePath, loopNodeIndex), cutoffMs));
      const flowJobs = flowLogs.map((filePath) =>
        readLogTokenSessions(filePath, flowLogMeta(filePath, flows), cutoffMs));
      return (await Promise.all([...loopJobs, ...flowJobs])).flat();
    },
    [],
    { log, label: 'collectLogTokenSessions' },
  );
}

async function getTokenMetrics(days = DEFAULT_DAYS) {
  const labels = generateDateRange(days);
  const [projectResults, logTokenSessions] = await Promise.all([
    collectProjectTokens(days),
    collectLogTokenSessions(days),
  ]);
  return {
    ...aggregateTokenData(labels, projectResults),
    ...buildTokenSessionRankings(logTokenSessions),
  };
}

module.exports = {
  getAllFlows,
  getTokenMetrics,
  getFlowRuns,
  buildFlowMetrics,
  buildAgentMetrics,
  collectUniqueCwds,
};
