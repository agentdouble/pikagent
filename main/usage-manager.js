const { Cache } = require('./cache');
const { createLogger } = require('./logger');
const {
  getAllFlows,
  getTokenMetrics,
  getFlowRuns,
  buildFlowMetrics,
  buildAgentMetrics,
  collectUniqueCwds,
} = require('./token-collector');
const { getMostModifiedFiles } = require('./git-metrics-collector');

const log = createLogger('usage-manager');

let _sessionManager = null;
const CACHE_TTL = 30_000;
const _metricsCache = new Cache(CACHE_TTL);

function init(sessionMgr) {
  _sessionManager = sessionMgr;
}

// ===== Aggregation =====

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
