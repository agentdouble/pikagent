const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const sessionManager = require('./session-manager');

const execFileAsync = promisify(execFile);

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const FLOWS_DIR = path.join(BASE_DIR, 'flows');

// Cache for metrics to avoid recomputing on every call
let _metricsCache = null;
let _metricsCacheTime = 0;
const CACHE_TTL = 30000; // 30 seconds

// ===== Helpers =====

function parseLogTimestamp(logTs) {
  const parts = logTs.split('T');
  if (parts.length !== 2) return null;
  const timePart = parts[1].replace(/-/g, (m, offset) => {
    if (offset <= 5) return ':';
    return '.';
  });
  return new Date(`${parts[0]}T${timePart}`);
}

function dateStr(iso) {
  return iso ? iso.slice(0, 10) : null;
}

function dayLabels(days = 30) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    });
  }
  return result;
}

// ===== Flow data =====

function getAllFlows() {
  try {
    fs.mkdirSync(FLOWS_DIR, { recursive: true });
    const files = fs.readdirSync(FLOWS_DIR).filter((f) => f.endsWith('.json'));
    return files
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(FLOWS_DIR, f), 'utf-8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
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
  return ms > 0 && ms < 24 * 60 * 60 * 1000 ? Math.round(ms / 1000) : null;
}

// ===== Generic stats =====

function computeRate(items, statusField = 'status') {
  if (items.length === 0) return { total: 0, success: 0, error: 0, rate: 0 };
  const success = items.filter((r) => r[statusField] === 'success' || r[statusField] === 'completed').length;
  const error = items.filter((r) => r[statusField] === 'error' || r[statusField] === 'exited').length;
  return {
    total: items.length,
    success,
    error,
    rate: items.length > 0 ? Math.round((success / items.length) * 100) : 0,
  };
}

function computeDuration(durations) {
  const valid = durations.filter((d) => d != null && d > 0);
  if (valid.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return {
    avg: Math.round(avg),
    min: Math.round(Math.min(...valid)),
    max: Math.round(Math.max(...valid)),
    count: valid.length,
  };
}

function perDay(items, dateExtractor, days = 30) {
  const labels = dayLabels(days);
  return labels.map((day) => {
    const dayItems = items.filter((r) => dateExtractor(r) === day.date);
    return {
      ...day,
      total: dayItems.length,
      success: dayItems.filter((r) => r.status === 'success' || r.status === 'completed').length,
      error: dayItems.filter((r) => r.status === 'error' || r.status === 'exited').length,
      running: dayItems.filter((r) => r.status === 'running').length,
    };
  });
}

// ===== Tokens (from Claude session JSONL files) =====

async function getTokenMetrics(days = 30) {
  const claudeDir = path.join(os.homedir(), '.claude', 'projects');
  const labels = dayLabels(days);
  const perDayMap = {};
  const perProjectMap = {};
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;

  for (const day of labels) {
    perDayMap[day.date] = { input: 0, output: 0 };
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  try {
    const projects = fs.readdirSync(claudeDir).filter((d) => {
      try { return fs.statSync(path.join(claudeDir, d)).isDirectory(); } catch { return false; }
    });

    for (const proj of projects) {
      const projDir = path.join(claudeDir, proj);
      let projInput = 0;
      let projOutput = 0;

      const files = fs.readdirSync(projDir).filter((f) => f.endsWith('.jsonl'));
      for (const file of files) {
        const fpath = path.join(projDir, file);
        let content;
        try { content = fs.readFileSync(fpath, 'utf-8'); } catch { continue; }

        for (const line of content.split('\n')) {
          if (!line.includes('"usage"')) continue;
          let entry;
          try { entry = JSON.parse(line); } catch { continue; }
          if (entry.type !== 'assistant' || !entry.message?.usage) continue;

          const u = entry.message.usage;
          const inp = u.input_tokens || 0;
          const out = u.output_tokens || 0;
          const cacheRead = u.cache_read_input_tokens || 0;
          const cacheCreate = u.cache_creation_input_tokens || 0;

          let dateKey = null;
          if (entry.timestamp) {
            const ts = typeof entry.timestamp === 'number' ? entry.timestamp : new Date(entry.timestamp).getTime();
            if (ts < cutoffMs) continue;
            dateKey = new Date(ts).toISOString().slice(0, 10);
          }

          totalInput += inp;
          totalOutput += out;
          totalCacheRead += cacheRead;
          totalCacheCreate += cacheCreate;
          projInput += inp;
          projOutput += out;

          if (dateKey && perDayMap[dateKey] !== undefined) {
            perDayMap[dateKey].input += inp;
            perDayMap[dateKey].output += out;
          }
        }
      }

      if (projInput + projOutput > 0) {
        const parts = proj.split('-').filter(Boolean);
        const shortName = parts.length > 2 ? parts.slice(-2).join('/') : parts.join('/');
        perProjectMap[shortName] = { input: projInput, output: projOutput, total: projInput + projOutput };
      }
    }
  } catch {}

  const perDayArr = labels.map((day) => ({
    ...day,
    input: perDayMap[day.date]?.input || 0,
    output: perDayMap[day.date]?.output || 0,
    total: (perDayMap[day.date]?.input || 0) + (perDayMap[day.date]?.output || 0),
  }));

  const perProject = Object.entries(perProjectMap)
    .map(([project, data]) => ({ project, ...data }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return {
    totalInput,
    totalOutput,
    totalCacheRead,
    totalCacheCreate,
    total: totalInput + totalOutput,
    perDay: perDayArr,
    perProject,
  };
}

// ===== Files =====

async function getMostModifiedFiles(cwds) {
  const fileCount = {};

  const results = await Promise.all(
    cwds.map(async (cwd) => {
      try {
        const { stdout } = await execFileAsync(
          'git',
          ['log', '--since=30 days ago', '--name-only', '--pretty=format:', '--diff-filter=ACMR'],
          { cwd, encoding: 'utf-8', timeout: 5000 }
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
    .slice(0, 15);
}

// ===== Main =====

async function getMetrics() {
  // Return cached result if still fresh
  const now = Date.now();
  if (_metricsCache && (now - _metricsCacheTime) < CACHE_TTL) {
    return _metricsCache;
  }

  // --- Flow metrics ---
  const flows = getAllFlows();
  const flowRuns = getFlowRuns(flows);
  const flowDurations = flowRuns.map(getFlowRunDuration);

  const flowMetrics = {
    rate: computeRate(flowRuns),
    duration: computeDuration(flowDurations),
    perDay: perDay(flowRuns, (r) => r.date, 30),
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

  // --- Agent session metrics ---
  const sessions = sessionManager.getSessions();
  const activeSessions = sessionManager.getActiveSessions();
  const allSessions = [...sessions, ...activeSessions];

  const agentMetrics = {
    rate: computeRate(allSessions),
    duration: computeDuration(allSessions.map((s) => s.durationSec)),
    perDay: perDay(allSessions, (s) => dateStr(s.startedAt), 30),
    byAgent: getByAgent(allSessions),
    totalSessions: allSessions.length,
    activeSessions: activeSessions.length,
  };

  // --- Combined files from all cwds ---
  const allCwds = [
    ...new Set([
      ...flowRuns.map((r) => r.cwd),
      ...allSessions.map((s) => s.cwd),
    ].filter(Boolean)),
  ];

  // --- Token metrics + modified files in parallel ---
  const [tokens, mostModifiedFiles] = await Promise.all([
    getTokenMetrics(30),
    getMostModifiedFiles(allCwds),
  ]);

  const result = {
    tokens,
    flow: flowMetrics,
    agent: agentMetrics,
    mostModifiedFiles,
    hasData: flows.length > 0 || allSessions.length > 0 || tokens.total > 0,
  };

  _metricsCache = result;
  _metricsCacheTime = now;

  return result;
}

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

module.exports = { getMetrics };
