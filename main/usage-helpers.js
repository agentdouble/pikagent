const os = require('os');
const { computeRate, computeDuration, perDay, dateStr, DEFAULT_DAYS } = require('./stats-helpers');

// ===== Constants =====

const TOKEN_KEYS = ['input', 'output', 'cacheRead', 'cacheCreate'];
const MAX_RUN_DURATION_MS = 24 * 60 * 60 * 1000;
const TOP_PROJECTS_LIMIT = 10;

// ===== Token helpers =====

function newTokenTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
}

function addTokens(target, source) {
  for (const k of TOKEN_KEYS) target[k] += source[k] || 0;
}

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
    dateKey = new Date(ts).toISOString().slice(0, 10);
  }

  return {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheCreate: u.cache_creation_input_tokens || 0,
    dateKey,
  };
}

function projectShortName(proj) {
  const parts = proj.split('-').filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/');
}

function aggregateTokenData(labels, projectResults) {
  const globalPerDay = {};
  for (const day of labels) globalPerDay[day.date] = { input: 0, output: 0 };

  const totals = newTokenTotals();
  const perProjectMap = {};

  for (const { proj, totals: pt, perDayMap } of projectResults) {
    addTokens(totals, pt);

    for (const [dateKey, dayData] of Object.entries(perDayMap)) {
      if (globalPerDay[dateKey]) {
        globalPerDay[dateKey].input += dayData.input;
        globalPerDay[dateKey].output += dayData.output;
      }
    }

    if (pt.input + pt.output > 0) {
      perProjectMap[projectShortName(proj)] = {
        input: pt.input,
        output: pt.output,
        total: pt.input + pt.output,
      };
    }
  }

  const tokenPerDay = labels.map((day) => {
    const g = globalPerDay[day.date];
    return { ...day, input: g.input, output: g.output, total: g.input + g.output };
  });

  const perProject = Object.entries(perProjectMap)
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
  const runs = [];
  for (const flow of flows) {
    if (!flow.runs) continue;
    for (const run of flow.runs) {
      runs.push({
        flowId: flow.id,
        flowName: flow.name,
        cwd: flow.cwd || os.homedir(),
        ...run,
      });
    }
  }
  return runs;
}

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
  const grouped = {};
  for (const s of sessions) {
    const name = s.agent || 'Unknown';
    if (!grouped[name]) grouped[name] = [];
    grouped[name].push(s);
  }
  return Object.entries(grouped).map(([agent, items]) => ({
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
    perDay: perDay(allSessions, (s) => dateStr(s.startedAt), DEFAULT_DAYS),
    byAgent: getByAgent(allSessions),
    totalSessions: allSessions.length,
    activeSessions: activeSessions.length,
  };
}

function collectUniqueCwds(flowRuns, sessions) {
  return [...new Set([
    ...flowRuns.map((r) => r.cwd),
    ...sessions.map((s) => s.cwd),
  ].filter(Boolean))];
}

module.exports = {
  TOKEN_KEYS,
  MAX_RUN_DURATION_MS,
  TOP_PROJECTS_LIMIT,
  newTokenTotals,
  addTokens,
  parseLogTimestamp,
  parseTokenUsage,
  projectShortName,
  aggregateTokenData,
  getFlowRuns,
  getFlowRunDuration,
  buildFlowMetrics,
  getByAgent,
  buildAgentMetrics,
  collectUniqueCwds,
};
