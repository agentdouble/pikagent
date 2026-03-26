const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sessionManager = require('./session-manager');
const { FLOWS_DIR, CLAUDE_PROJECTS_DIR } = require('./paths');
const { readDirJson } = require('./fs-utils');
const { DEFAULT_DAYS, countByStatus, computeRate, computeDuration, dateStr, dayLabels, perDay } = require('./stats-helpers');

const execFileAsync = promisify(execFile);

// ===== Constants =====

const CACHE_TTL = 30000;
const MAX_RUN_DURATION_MS = 24 * 60 * 60 * 1000;
const TOP_PROJECTS_LIMIT = 10;
const TOP_FILES_LIMIT = 15;
const GIT_TIMEOUT_MS = 5000;

const TOKEN_KEYS = ['input', 'output', 'cacheRead', 'cacheCreate'];

let _metricsCache = null;
let _metricsCacheTime = 0;

// ===== Helpers =====

function _newTokenTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };
}

function _addTokens(target, source) {
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

// ===== Flow data =====

async function getAllFlows() {
  return readDirJson(FLOWS_DIR);
}

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

// ===== Tokens (from Claude session JSONL files) =====

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

async function readProjectTokens(projDir, cutoffMs) {
  const totals = _newTokenTotals();
  const perDayMap = {};

  const files = (await fsp.readdir(projDir)).filter((f) => f.endsWith('.jsonl'));
  for (const file of files) {
    let content;
    try { content = await fsp.readFile(path.join(projDir, file), 'utf-8'); } catch { continue; }

    for (const line of content.split('\n')) {
      const usage = parseTokenUsage(line, cutoffMs);
      if (!usage) continue;

      _addTokens(totals, usage);

      if (usage.dateKey) {
        if (!perDayMap[usage.dateKey]) perDayMap[usage.dateKey] = { input: 0, output: 0 };
        perDayMap[usage.dateKey].input += usage.input;
        perDayMap[usage.dateKey].output += usage.output;
      }
    }
  }

  return { totals, perDayMap };
}

function projectShortName(proj) {
  const parts = proj.split('-').filter(Boolean);
  return parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/');
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

function aggregateTokenData(labels, projectResults) {
  const globalPerDay = {};
  for (const day of labels) globalPerDay[day.date] = { input: 0, output: 0 };

  const totals = _newTokenTotals();
  const perProjectMap = {};

  for (const { proj, totals: pt, perDayMap } of projectResults) {
    _addTokens(totals, pt);

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

async function getTokenMetrics(days = DEFAULT_DAYS) {
  const labels = dayLabels(days);
  const projectResults = await collectProjectTokens(days);
  return aggregateTokenData(labels, projectResults);
}

// ===== Files =====

async function getMostModifiedFiles(cwds) {
  const fileCount = {};

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

  for (const { cwd, files } of results) {
    for (const f of files) {
      const key = `${path.basename(path.dirname(cwd))}/${path.basename(cwd)}/${f}`;
      fileCount[key] = (fileCount[key] || 0) + 1;
    }
  }

  return Object.entries(fileCount)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_FILES_LIMIT);
}

// ===== Metric builders =====

function _buildFlowMetrics(flows, flowRuns) {
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

function _buildAgentMetrics() {
  const sessions = sessionManager.getSessions();
  const activeSessions = sessionManager.getActiveSessions();
  const allSessions = [...sessions, ...activeSessions];
  return {
    metrics: {
      rate: computeRate(allSessions),
      duration: computeDuration(allSessions.map((s) => s.durationSec)),
      perDay: perDay(allSessions, (s) => dateStr(s.startedAt), DEFAULT_DAYS),
      byAgent: _getByAgent(allSessions),
      totalSessions: allSessions.length,
      activeSessions: activeSessions.length,
    },
    allSessions,
  };
}

function _getByAgent(sessions) {
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

function _collectUniqueCwds(flowRuns, sessions) {
  return [...new Set([
    ...flowRuns.map((r) => r.cwd),
    ...sessions.map((s) => s.cwd),
  ].filter(Boolean))];
}

// ===== Aggregation =====

async function getMetrics() {
  const now = Date.now();
  if (_metricsCache && (now - _metricsCacheTime) < CACHE_TTL) {
    return _metricsCache;
  }

  const flows = await getAllFlows();
  const flowRuns = getFlowRuns(flows);
  const { metrics: agentMetrics, allSessions } = _buildAgentMetrics();

  const [tokens, mostModifiedFiles] = await Promise.all([
    getTokenMetrics(DEFAULT_DAYS),
    getMostModifiedFiles(_collectUniqueCwds(flowRuns, allSessions)),
  ]);

  const result = {
    tokens,
    flow: _buildFlowMetrics(flows, flowRuns),
    agent: agentMetrics,
    mostModifiedFiles,
    hasData: flows.length > 0 || allSessions.length > 0 || tokens.total > 0,
  };

  _metricsCache = result;
  _metricsCacheTime = now;

  return result;
}

module.exports = { getMetrics };
