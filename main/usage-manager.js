const { FLOWS_DIR } = require('./paths');
const { readDirJson } = require('./fs-utils');
const {
  getFlowRuns,
  buildFlowMetrics,
  buildAgentMetrics,
  collectUniqueCwds,
  CACHE_TTL,
} = require('./usage-helpers');
const { Cache } = require('./cache');
const { getTokenMetrics } = require('./token-collector');
const { getMostModifiedFiles } = require('./git-metrics-collector');

let _sessionManager = null;
const _metricsCache = new Cache(CACHE_TTL);

function init(sessionMgr) {
  _sessionManager = sessionMgr;
}

async function getAllFlows() {
  return readDirJson(FLOWS_DIR);
}

async function getMetrics() {
  const cached = _metricsCache.get();
  if (cached) return cached;

  const flows = await getAllFlows();
  const flowRuns = getFlowRuns(flows);

  const sessions = _sessionManager.getSessions();
  const activeSessions = _sessionManager.getActiveSessions();
  const allSessions = [...sessions, ...activeSessions];

  const agentMetrics = buildAgentMetrics(sessions, activeSessions);

  const [tokens, mostModifiedFiles] = await Promise.all([
    getTokenMetrics(),
    getMostModifiedFiles(collectUniqueCwds(flowRuns, allSessions)),
  ]);

  const result = {
    tokens,
    flow: buildFlowMetrics(flows, flowRuns),
    agent: agentMetrics,
    mostModifiedFiles,
    hasData: flows.length > 0 || allSessions.length > 0 || tokens.total > 0,
  };

  _metricsCache.set(result);

  return result;
}

module.exports = { init, getMetrics };
