const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const BASE_DIR = path.join(os.homedir(), '.config', '.pickagent');
const FLOWS_DIR = path.join(BASE_DIR, 'flows');
const LOGS_DIR = path.join(FLOWS_DIR, 'logs');

function parseLogTimestamp(logTs) {
  // Format: 2024-03-20T10-30-00-000Z → 2024-03-20T10:30:00.000Z
  const parts = logTs.split('T');
  if (parts.length !== 2) return null;
  const timePart = parts[1].replace(/-/g, (m, offset) => {
    // First two dashes → colons, third → dot
    if (offset <= 5) return ':';
    return '.';
  });
  return new Date(`${parts[0]}T${timePart}`);
}

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

function getAllRuns(flows) {
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

function getRunsPerDay(runs, days = 30) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayRuns = runs.filter((r) => r.date === dateStr);
    result.push({
      date: dateStr,
      label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      total: dayRuns.length,
      success: dayRuns.filter((r) => r.status === 'success').length,
      error: dayRuns.filter((r) => r.status === 'error').length,
    });
  }
  return result;
}

function getSuccessRate(runs) {
  if (runs.length === 0) return { total: 0, success: 0, error: 0, rate: 0 };
  const success = runs.filter((r) => r.status === 'success').length;
  const error = runs.filter((r) => r.status === 'error').length;
  return {
    total: runs.length,
    success,
    error,
    rate: Math.round((success / runs.length) * 100),
  };
}

function getAverageDuration(runs) {
  const durations = [];
  for (const run of runs) {
    if (!run.logTimestamp || !run.timestamp) continue;
    const start = parseLogTimestamp(run.logTimestamp);
    const end = new Date(run.timestamp);
    if (!start || isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    const durationMs = end.getTime() - start.getTime();
    if (durationMs > 0 && durationMs < 24 * 60 * 60 * 1000) {
      durations.push(durationMs);
    }
  }
  if (durations.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
  return {
    avg: Math.round(avg / 1000),
    min: Math.round(Math.min(...durations) / 1000),
    max: Math.round(Math.max(...durations) / 1000),
    count: durations.length,
  };
}

function getMostModifiedFiles(runs) {
  // Collect unique cwds from runs
  const cwds = [...new Set(runs.map((r) => r.cwd).filter(Boolean))];
  const fileCount = {};

  for (const cwd of cwds) {
    try {
      // Get files changed in recent git commits (last 30 days)
      const output = execSync(
        'git log --since="30 days ago" --name-only --pretty=format: --diff-filter=ACMR 2>/dev/null',
        { cwd, encoding: 'utf-8', timeout: 5000 }
      );
      const files = output
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      for (const f of files) {
        const key = `${path.basename(path.dirname(cwd))}/${path.basename(cwd)}/${f}`;
        fileCount[key] = (fileCount[key] || 0) + 1;
      }
    } catch {
      // Not a git repo or error — skip
    }
  }

  return Object.entries(fileCount)
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
}

function getFlowStats(flows, runs) {
  return flows.map((flow) => {
    const flowRuns = runs.filter((r) => r.flowId === flow.id);
    const stats = getSuccessRate(flowRuns);
    const duration = getAverageDuration(flowRuns);
    return {
      id: flow.id,
      name: flow.name,
      enabled: flow.enabled,
      totalRuns: stats.total,
      successRate: stats.rate,
      avgDuration: duration.avg,
    };
  });
}

function getMetrics() {
  const flows = getAllFlows();
  const runs = getAllRuns(flows);

  return {
    runsPerDay: getRunsPerDay(runs, 30),
    successRate: getSuccessRate(runs),
    duration: getAverageDuration(runs),
    mostModifiedFiles: getMostModifiedFiles(runs),
    flowStats: getFlowStats(flows, runs),
    totalFlows: flows.length,
    activeFlows: flows.filter((f) => f.enabled).length,
  };
}

module.exports = { getMetrics };
