const os = require('os');
const path = require('path');
const { computeRate, computeDuration, perDay, DEFAULT_DAYS } = require('./stats-helpers');
const { extractDateString, toDateString } = require('../shared/date-utils');
const {
  aggregateByKey,
  groupAndAggregate,
  accumulateBy,
  sumByKeys,
  mapFields,
  countBy,
  rankTopByDesc,
  initializeCounters,
  createDomainMetricsBuilder,
} = require('../shared/aggregation-utils');

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
const TOP_TOKEN_SESSIONS_LIMIT = 15;
const TOP_TOKEN_CONSUMERS_LIMIT = 15;
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
    dateKey = toDateString(ts);
  }

  return {
    ...mapFields(u, TOKEN_FIELD_MAP),
    dateKey,
  };
}

function parseHumanTokenCount(text) {
  const match = String(text || '').match(/\d[\d\s\u00a0\u202f,._]*/);
  if (!match) return 0;
  const digits = match[0].replace(/[^\d]/g, '');
  const total = Number(digits);
  return Number.isSafeInteger(total) ? total : 0;
}

function parseTextTokenUsageSessions(text, meta = {}) {
  const lines = String(text || '').split(/\r?\n/);
  const records = [];
  let sessionId = meta.sessionId || '';

  for (let i = 0; i < lines.length; i += 1) {
    const sessionMatch = lines[i].match(/\bsession id:\s*([0-9a-f-]{16,})/i);
    if (sessionMatch) sessionId = sessionMatch[1];
    if (!/tokens used/i.test(lines[i])) continue;

    let total = parseHumanTokenCount(lines[i].replace(/tokens used/i, ''));
    if (!total) {
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j += 1) {
        total = parseHumanTokenCount(lines[j]);
        if (total) break;
      }
    }
    if (!total) continue;

    records.push({
      sessionId,
      total,
      label: meta.label || 'Session',
      source: meta.source || 'log',
      consumerKey: meta.consumerKey || meta.label || meta.logFile || 'log',
      logFile: meta.logFile || '',
      runIndex: records.length + 1,
      ...(meta.consumerType ? { consumerType: meta.consumerType } : {}),
    });
  }

  return records;
}

function tokenSessionSourceRank(item) {
  if (item.consumerType === 'agent') return 4;
  if (item.consumerType === 'flow') return 3;
  if (item.consumerType === 'executable') return 1;
  return 2;
}

function tokenSessionKey(item) {
  return item.sessionId
    ? `session:${item.sessionId}`
    : `entry:${item.consumerKey || item.label}:${item.logFile}:${item.runIndex}:${item.total}`;
}

function mergeTokenSession(existing, item) {
  if (!existing) return item;
  const preferred = tokenSessionSourceRank(item) > tokenSessionSourceRank(existing) ? item : existing;
  return { ...preferred, total: Math.max(existing.total || 0, item.total || 0) };
}

function dedupeTokenSessions(tokenSessions) {
  const byKey = new Map();
  for (const item of tokenSessions) {
    const key = tokenSessionKey(item);
    byKey.set(key, mergeTokenSession(byKey.get(key), item));
  }
  return [...byKey.values()];
}

function buildTokenSessionRankings(tokenSessions) {
  const deduped = dedupeTokenSessions(tokenSessions);
  const sessionTotal = deduped.reduce((sum, item) => sum + (item.total || 0), 0);
  const perConsumerAgg = aggregateByKey(
    deduped,
    (item) => item.consumerKey || item.label || 'unknown',
    () => ({ label: '', source: '', total: 0, runs: 0 }),
    (bucket, item) => {
      bucket.label = bucket.label || item.label || item.consumerKey || 'Unknown';
      bucket.source = bucket.source || item.source || 'log';
      bucket.total += item.total || 0;
      bucket.runs += 1;
    },
  );

  return {
    sessionTotal,
    sessionCount: deduped.length,
    perTokenConsumer: rankTopByDesc(
      perConsumerAgg,
      (consumerKey, data) => ({ consumerKey, ...data }),
      'total',
      TOP_TOKEN_CONSUMERS_LIMIT,
    ),
    perTokenSession: [...deduped]
      .sort((a, b) => (b.total || 0) - (a.total || 0))
      .slice(0, TOP_TOKEN_SESSIONS_LIMIT),
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
    projectResults.filter(({ totals: pt }) => sumByKeys(pt, PERDAY_KEYS) > 0),
    ({ proj }) => projectShortName(proj),
    () => ({ ...initializeCounters(PERDAY_KEYS), total: 0 }),
    (bucket, { totals: pt }) => {
      addTokens(bucket, pt, PERDAY_KEYS);
      bucket.total += sumByKeys(pt, PERDAY_KEYS);
    },
  );

  return rankTopByDesc(
    perProjectAgg,
    (project, data) => ({ project, ...data }),
    'total',
    TOP_PROJECTS_LIMIT,
  );
}

function aggregateTokenData(labels, projectResults) {
  const globalPerDay = buildGlobalPerDay(labels, projectResults);

  const totals = newTokenTotals();
  for (const { totals: pt } of projectResults) addTokens(totals, pt);

  const perDay = labels.map((day) => {
    const g = globalPerDay[day.date] || newPerDayTotals();
    const total = sumByKeys(g, PERDAY_KEYS);
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
 * Domain-specific metrics builder — pre-configured with domain rate/perDay
 * functions via createDomainMetricsBuilder, eliminating repeated config injection.
 */
const buildMetrics = createDomainMetricsBuilder({
  rateFn: computeRate,
  perDayFn: perDay,
  days: DEFAULT_DAYS,
});

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
  return rankTopByDesc(
    countBy(allFiles, k => k),
    (file, count) => ({ file, count }),
    'count',
    limit,
  );
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
  parseHumanTokenCount,
  parseTextTokenUsageSessions,
  buildTokenSessionRankings,
  aggregateTokenData,
  accumulatePerDay,
  rankModifiedFiles,
  getFlowRuns,
  buildFlowMetrics,
  buildAgentMetrics,
  collectUniqueCwds,
};
