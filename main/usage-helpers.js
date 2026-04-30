const os = require('os');
const path = require('path');
const { computeRate, computeDuration, perDay, DEFAULT_DAYS } = require('./stats-helpers');
const { extractDateString } = require('./date-utils');
const { aggregateByKey, groupAndAggregate } = require('./aggregation-utils');
const { accumulateBy, countBy, initializeCounters } = require('../shared/aggregation-utils');

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
const TOP_FILES_LIMIT = 15;
const GIT_TIMEOUT_MS = 5000;

// ===== Token helpers =====

function newTokenTotals() {
  return initializeCounters(TOKEN_FIELD_MAP);
}

function newPerDayTotals() {
  return initializeCounters(PERDAY_KEYS);
}

/**
 * Add numeric token fields from `source` into `target` (in-place).
 * Delegates to the generic accumulateBy helper.
 * @param {Record<string, number>} target
 * @param {Record<string, number>} source
 * @param {string[]} [keys=TOKEN_KEYS] - field names to accumulate
 */
function addTokens(target, source, keys = TOKEN_KEYS) {
  accumulateBy(target, source, keys);
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

/** @internal Build aggregated per-day token buckets from project results, filtered to valid label dates. */
function buildGlobalPerDay(labels, projectResults) {
  const validDates = new Set(labels.map(d => d.date));

  const perDayEntries = projectResults.flatMap(({ perDayMap }) =>
    Object.entries(perDayMap)
      .filter(([dateKey]) => validDates.has(dateKey))
      .map(([dateKey, dayData]) => ({ dateKey, dayData })),
  );

  return aggregateByKey(
    perDayEntries,
    ({ dateKey }) => dateKey,
    () => newPerDayTotals(),
    (bucket, { dayData }) => addTokens(bucket, dayData, PERDAY_KEYS),
  );
}

/** @internal Aggregate per-project token data, sorted by total descending. */
function buildPerProjectRanking(projectResults) {
  const perProjectAgg = aggregateByKey(
    projectResults.filter(({ totals: pt }) => PERDAY_KEYS.reduce((sum, k) => sum + pt[k], 0) > 0),
    ({ proj }) => projectShortName(proj),
    () => ({ ...initializeCounters(PERDAY_KEYS), total: 0 }),
    (bucket, { totals: pt }) => {
      addTokens(bucket, pt, PERDAY_KEYS);
      bucket.total += PERDAY_KEYS.reduce((sum, k) => sum + pt[k], 0);
    },
  );

  return Object.entries(perProjectAgg)
    .map(([project, data]) => ({ project, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, TOP_PROJECTS_LIMIT);
}

function aggregateTokenData(labels, projectResults) {
  const globalPerDay = buildGlobalPerDay(labels, projectResults);

  const totals = newTokenTotals();
  for (const { totals: pt } of projectResults) addTokens(totals, pt);

  const perDay = labels.map((day) => {
    const g = globalPerDay[day.date] || newPerDayTotals();
    const total = PERDAY_KEYS.reduce((sum, k) => sum + g[k], 0);
    return { ...day, ...g, total };
  });

  return {
    totalInput: totals.input,
    totalOutput: totals.output,
    totalCacheRead: totals.cacheRead,
    totalCacheCreate: totals.cacheCreate,
    total: totals.input + totals.output,
    perDay,
    perProject: buildPerProjectRanking(projectResults),
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

/**
 * Shared metrics builder — computes rate, duration, and perDay from a list of
 * items and merges any extra fields supplied by the caller.
 *
 * @param {Array<{ status?: string, [key: string]: unknown }>} items - The items to compute base metrics for
 * @param {{ durationMapper: (item: { status?: string, [key: string]: unknown }) => number|null,
 *           dateExtractor: (item: { status?: string, [key: string]: unknown }) => string,
 *           extra?: Record<string, unknown> }} opts
 * @returns {Record<string, unknown>}
 */
function buildMetrics(items, { durationMapper, dateExtractor, extra = {} }) {
  return {
    rate: computeRate(items),
    duration: computeDuration(items.map(durationMapper)),
    perDay: perDay(items, dateExtractor, DEFAULT_DAYS),
    ...extra,
  };
}

function buildFlowMetrics(flows, flowRuns) {
  return buildMetrics(flowRuns, {
    durationMapper: getFlowRunDuration,
    dateExtractor: (r) => r.date,
    extra: {
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
    },
  });
}

// ===== Agent helpers =====

function getByAgent(sessions) {
  const grouped = groupAndAggregate(
    sessions,
    (s) => s.agent || 'Unknown',
    (items) => ({
      totalSessions: items.length,
      successRate: computeRate(items).rate,
      avgDuration: computeDuration(items.map((s) => s.durationSec)).avg,
      active: items.filter((s) => s.status === 'running').length,
    }),
  );
  return Object.entries(grouped).map(([agent, data]) => ({ agent, ...data }));
}

function buildAgentMetrics(sessions, activeSessions) {
  const allSessions = [...sessions, ...activeSessions];
  return buildMetrics(allSessions, {
    durationMapper: (s) => s.durationSec,
    dateExtractor: (s) => extractDateString(s.startedAt),
    extra: {
      byAgent: getByAgent(allSessions),
      totalSessions: allSessions.length,
      activeSessions: activeSessions.length,
    },
  });
}

function accumulatePerDay(perDayMap, usage) {
  if (!usage.dateKey) return;
  if (!perDayMap[usage.dateKey]) perDayMap[usage.dateKey] = newPerDayTotals();
  addTokens(perDayMap[usage.dateKey], usage, PERDAY_KEYS);
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
