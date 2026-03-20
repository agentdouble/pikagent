const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const sessionManager = require('./session-manager');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const FLOWS_DIR = path.join(BASE_DIR, 'flows');

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
    };
  });
}

// ===== Files =====

function getMostModifiedFiles(cwds) {
  const fileCount = {};
  for (const cwd of cwds) {
    try {
      const output = execSync(
        'git log --since="30 days ago" --name-only --pretty=format: --diff-filter=ACMR 2>/dev/null',
        { cwd, encoding: 'utf-8', timeout: 5000 }
      );
      const files = output.split('\n').map((l) => l.trim()).filter(Boolean);
      for (const f of files) {
        const key = `${path.basename(path.dirname(cwd))}/${path.basename(cwd)}/${f}`;
        fileCount[key] = (fileCount[key] || 0) + 1;
      }
    } catch {}
  }
  return Object.entries(fileCount)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

// ===== Main =====

function getMetrics() {
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

  return {
    flow: flowMetrics,
    agent: agentMetrics,
    mostModifiedFiles: getMostModifiedFiles(allCwds),
    hasData: flows.length > 0 || allSessions.length > 0,
  };
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
