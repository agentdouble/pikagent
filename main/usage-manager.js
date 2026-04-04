const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { FLOWS_DIR, CLAUDE_PROJECTS_DIR } = require('./paths');
const { readDirJson } = require('./fs-utils');
const { DEFAULT_DAYS, dayLabels } = require('./stats-helpers');
const {
  newTokenTotals,
  addTokens,
  parseTokenUsage,
  aggregateTokenData,
  accumulatePerDay,
  rankModifiedFiles,
  getFlowRuns,
  buildFlowMetrics,
  buildAgentMetrics,
  collectUniqueCwds,
  CACHE_TTL,
  TOP_FILES_LIMIT,
  GIT_TIMEOUT_MS,
} = require('./usage-helpers');

const execFileAsync = promisify(execFile);

let _sessionManager = null;
let _metricsCache = null;
let _metricsCacheTime = 0;

function init(sessionMgr) {
  _sessionManager = sessionMgr;
}

// ===== I/O =====

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

  try {
    const allEntries = await fsp.readdir(CLAUDE_PROJECTS_DIR, { withFileTypes: true });
    const projects = allEntries.filter((d) => d.isDirectory()).map((d) => d.name);
    return Promise.all(
      projects.map(async (proj) => {
        const data = await readProjectTokens(path.join(CLAUDE_PROJECTS_DIR, proj), cutoffMs);
        return { proj, ...data };
      })
    );
  } catch (err) {
    console.error('[usage-manager] Failed to read Claude projects:', err.message);
    return [];
  }
}

async function getTokenMetrics(days = DEFAULT_DAYS) {
  const labels = dayLabels(days);
  const projectResults = await collectProjectTokens(days);
  return aggregateTokenData(labels, projectResults);
}

async function getMostModifiedFiles(cwds) {
  const results = await Promise.all(
    cwds.map(async (cwd) => {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['log', `--since=${DEFAULT_DAYS} days ago`, '--name-only', '--pretty=format:', '--diff-filter=ACMR'],
          { cwd, encoding: 'utf-8', timeout: GIT_TIMEOUT_MS }
        );
        return { cwd, files: stdout.split('\n').map((l) => l.trim()).filter(Boolean) };
      } catch {
        return { cwd, files: [] };
      }
    })
  );

  return rankModifiedFiles(results, TOP_FILES_LIMIT);
}

// ===== Aggregation =====

async function getMetrics() {
  const now = Date.now();
  if (_metricsCache && (now - _metricsCacheTime) < CACHE_TTL) {
    return _metricsCache;
  }

  const flows = await getAllFlows();
  const flowRuns = getFlowRuns(flows);

  const sessions = _sessionManager.getSessions();
  const activeSessions = _sessionManager.getActiveSessions();
  const allSessions = [...sessions, ...activeSessions];

  const agentMetrics = buildAgentMetrics(sessions, activeSessions);

  const [tokens, mostModifiedFiles] = await Promise.all([
    getTokenMetrics(DEFAULT_DAYS),
    getMostModifiedFiles(collectUniqueCwds(flowRuns, allSessions)),
  ]);

  const result = {
    tokens,
    flow: buildFlowMetrics(flows, flowRuns),
    agent: agentMetrics,
    mostModifiedFiles,
    hasData: flows.length > 0 || allSessions.length > 0 || tokens.total > 0,
  };

  _metricsCache = result;
  _metricsCacheTime = now;

  return result;
}

function registerHandlers(ipcMain, { sessionManager }) {
  const { registerForward } = require('./ipc-helpers');

  init(sessionManager);

  registerForward(ipcMain, { getMetrics }, [
    ['usage:getMetrics', 'getMetrics'],
  ]);
}

module.exports = { init, getMetrics, registerHandlers };
