const os = require('os');
const path = require('path');
const { computeRate, computeDuration, perDay, DEFAULT_DAYS } = require('./stats-helpers');
const { extractDateString } = require('./date-utils');
const { groupBy, countBy } = require('./collection-helpers');
const { aggregateByKey } = require('./aggregation-utils');

// ===== Declarative configs =====

/** Single source of truth for token field mapping: internal key ↔ API field name. */
const TOKEN_FIELD_MAP = [
  { key: 'input',       apiField: 'input_tokens',                perDay: true },
  { key: 'output',      apiField: 'output_tokens',               perDay: true },
  { key: 'cacheRead',   apiField: 'cache_read_input_tokens'                   },
  { key: 'cacheCreate', apiField: 'cache_creation_input_tokens'               },
];

/** All token keys, derived from TOKEN_FIELD_MAP. */
const TOKEN_KEYS = TOKEN_FIELD_MAP.map(f => f.key);

/** Token keys tracked per-day, derived from TOKEN_FIELD_MAP. */
const PERDAY_KEYS = TOKEN_FIELD_MAP.filter(f => f.perDay).map(f => f.key);

// ===== Constants =====

const MAX_RUN_DURATION_MS = 24 * 60 * 60 * 1000;
const TOP_PROJECTS_LIMIT = 10;
const CACHE_TTL = 30000;
const TOP_FILES_LIMIT = 15;
const GIT_TIMEOUT_MS = 5000;

// ===== Token helpers =====

function newTokenTotals() {
  return Object.fromEntries(TOKEN_FIELD_MAP.map(f => [f.key, 0]));
}

function newPerDayTotals() {
  return Object.fromEntries(PERDAY_KEYS.map(k => [k, 0]));
}

function addTokens(target, source) {
  for (const k of TOKEN_KEYS) target[k] += source[k] || 0;
}

/** @internal */
function parseLogTimestamp(logTs) {
  const parts = logTs.split('T');
  if (parts.length !== 2) return null;
  const timePart = parts[1].replace(/-/g, (m, offset) => {
    if (offset <= 5) return ':';
    return '.';
  });
  return new Date(`${parts[0]}T${timePart}`);
}

function parseTokenUsage(line, cutoffMs) {
  if (!line.includes('"usage"')) return null;
  let entry;
  try { entry = JSON.parse(line); } catch { return null; }
  if (entry.type !== 'assistant' || !entry.message?.usage) return null;

  const u = entry.message.usage;
  let dateKey = null;
  if (entry.timestamp) {
    const ts = typeof entry.timestamp === 'number' ? entry.timestamp : new Date(entry.timestamp).getTime();
    if (ts < cutoffMs) return null;
    dateKey = extractDateString(new Date(ts).toISOString());
  }

  return {
    ...Object.fromEntries(TOKEN_FIELD_MAP.map(f => [f.key, u[f.apiField] || 0])),
    dateKey,
  };
}

/** @internal */
function projectShortName(proj) {
  const parts = proj.split('-').filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/');
}

function aggregateTokenData(labels, projectResults) {
  const globalPerDay = {};
  for (const day of labels) globalPerDay[day.date] = newPerDayTotals();

  const totals = newTokenTotals();

  for (const { totals: pt, perDayMap } of projectResults) {
    addTokens(totals, pt);
    for (const [dateKey, dayData] of Object.entries(perDayMap)) {
      if (globalPerDay[dateKey]) {
        for (const k of PERDAY_KEYS) globalPerDay[dateKey][k] += dayData[k];
      }
    }
  }

  // Use aggregateByKey to accumulate per-project token data
  const perProjectAgg = aggregateByKey(
    projectResults.filter(({ totals: pt }) => PERDAY_KEYS.reduce((sum, k) => sum + pt[k], 0) > 0),
    ({ proj }) => projectShortName(proj),
    () => ({ ...Object.fromEntries(PERDAY_KEYS.map(k => [k, 0])), total: 0 }),
    (bucket, { totals: pt }) => {
      for (const k of PERDAY_KEYS) bucket[k] += pt[k];
      bucket.total += PERDAY_KEYS.reduce((sum, k) => sum + pt[k], 0);
    },
  );

  const tokenPerDay = labels.map((day) => {
    const g = globalPerDay[day.date];
    const total = PERDAY_KEYS.reduce((sum, k) => sum + g[k], 0);
    return { ...day, ...g, total };
  });

  const perProject = Object.entries(perProjectAgg)
    .map(([project, data]) => ({ project, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_PROJECTS_LIMIT);

  return {
    totalInput: totals.input,
    totalOutput: totals.output,
    totalCacheRead: totals.cacheRead,
    totalCacheCreate: totals.cacheCreate,
    total: totals.input + totals.output,
    perDay: tokenPerDay,
    perProject,
  };
}

// ===== Flow helpers =====

function getFlowRuns(flows) {
  return flows.flatMap(flow =>
    (flow.runs || []).map(run => ({
      flowId: flow.id,
      flowName: flow.name,
      cwd: flow.cwd || os.homedir(),
      ...run,
    }))
  );
}

/** @internal */
function getFlowRunDuration(run) {
  if (!run.logTimestamp || !run.timestamp) return null;
  const start = parseLogTimestamp(run.logTimestamp);
  const end = new Date(run.timestamp);
  if (!start || isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  const ms = end.getTime() - start.getTime();
  return ms > 0 && ms < MAX_RUN_DURATION_MS ? Math.round(ms / 1000) : null;
}

function buildFlowMetrics(flows, flowRuns) {
  return {
    rate: computeRate(flowRuns),
    duration: computeDuration(flowRuns.map(getFlowRunDuration)),
    perDay: perDay(flowRuns, (r) => r.date, DEFAULT_DAYS),
    flowStats: flows.map((flow) => {
      const runs = flowRuns.filter((r) => r.flowId === flow.id);
      const rate = computeRate(runs);
      const dur = computeDuration(runs.map(getFlowRunDuration));
      return {
        id: flow.id,
        name: flow.name,
        enabled: flow.enabled,
        totalRuns: rate.total,
        successRate: rate.rate,
        avgDuration: dur.avg,
      };
    }),
    totalFlows: flows.length,
    activeFlows: flows.filter((f) => f.enabled).length,
  };
}

// ===== Agent helpers =====

function getByAgent(sessions) {
  return Object.entries(groupBy(sessions, s => s.agent || 'Unknown'))
    .map(([agent, items]) => ({
      agent,
      totalSessions: items.length,
      successRate: computeRate(items).rate,
      avgDuration: computeDuration(items.map((s) => s.durationSec)).avg,
      active: items.filter((s) => s.status === 'running').length,
    }));
}

function buildAgentMetrics(sessions, activeSessions) {
  const allSessions = [...sessions, ...activeSessions];
  return {
    rate: computeRate(allSessions),
    duration: computeDuration(allSessions.map((s) => s.durationSec)),
    perDay: perDay(allSessions, (s) => extractDateString(s.startedAt), DEFAULT_DAYS),
    byAgent: getByAgent(allSessions),
    totalSessions: allSessions.length,
    activeSessions: activeSessions.length,
  };
}

function accumulatePerDay(perDayMap, usage) {
  if (!usage.dateKey) return;
  if (!perDayMap[usage.dateKey]) perDayMap[usage.dateKey] = newPerDayTotals();
  for (const k of PERDAY_KEYS) perDayMap[usage.dateKey][k] += usage[k];
}

/** @internal */
function buildFileKey(cwd, filePath) {
  return `${path.basename(path.dirname(cwd))}/${path.basename(cwd)}/${filePath}`;
}

function rankModifiedFiles(results, limit = TOP_FILES_LIMIT) {
  const allFiles = results.flatMap(({ cwd, files }) => files.map(f => buildFileKey(cwd, f)));
  return Object.entries(countBy(allFiles, k => k))
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function collectUniqueCwds(flowRuns, sessions) {
  return [...new Set([
    ...flowRuns.map((r) => r.cwd),
    ...sessions.map((s) => s.cwd),
  ].filter(Boolean))];
}

module.exports = {
  CACHE_TTL,
  TOP_FILES_LIMIT,
  GIT_TIMEOUT_MS,
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
};
