const path = require('path');
const { FLOWS_DIR, LOGS_DIR } = require('./paths');

const MS_PER_HOUR = 3_600_000;
const SCHEDULER_INTERVAL_MS = 60_000;
const SHELL_INIT_DELAY_MS = 500;
const MAX_RUN_HISTORY = 7;
const DEFAULT_PTY_COLS = 120;
const DEFAULT_PTY_ROWS = 30;

function flowPath(id) {
  return path.join(FLOWS_DIR, `${id}.json`);
}

function logPath(flowId, timestamp) {
  return path.join(LOGS_DIR, `${flowId}_${timestamp}.log`);
}

const AGENT_COMMANDS = {
  claude: (prompt, opts = {}) =>
    opts.dangerouslySkipPermissions
      ? `claude --dangerously-skip-permissions --output-format stream-json -p '${prompt}'`
      : `claude --permission-mode auto --output-format stream-json -p '${prompt}'`,
  codex: (prompt, opts = {}) =>
    opts.dangerouslySkipPermissions
      ? `codex --approval-mode full-auto --quiet '${prompt}'`
      : `codex --approval-mode auto-edit --quiet '${prompt}'`,
  opencode: (prompt) => `opencode -p '${prompt}'`,
};

function getLastRun(flow) {
  return flow.runs?.at(-1) ?? null;
}

function shouldRun(flow, now) {
  const { schedule } = flow;
  if (!schedule) return false;

  const lastRun = getLastRun(flow);

  if (schedule.type === 'interval') {
    const intervalMs = (schedule.intervalHours || 1) * MS_PER_HOUR;
    if (!lastRun) return true;
    return now.getTime() - new Date(lastRun.timestamp).getTime() >= intervalMs;
  }

  if (!schedule.time) return false;

  const [hours, minutes] = schedule.time.split(':').map(Number);
  if (now.getHours() !== hours || now.getMinutes() !== minutes) return false;

  const day = now.getDay();
  if (schedule.type === 'weekdays' && (day === 0 || day === 6)) return false;
  if (schedule.type === 'custom' && schedule.days && !schedule.days.includes(day)) return false;

  const todayStr = now.toISOString().slice(0, 10);
  return !lastRun || lastRun.date !== todayStr;
}

function buildFlowCommand(flow) {
  const escapedPrompt = flow.prompt.replace(/'/g, "'\\''");
  const agent = flow.agent || 'claude';
  const buildCmd = AGENT_COMMANDS[agent] || AGENT_COMMANDS.claude;
  return `${buildCmd(escapedPrompt, { dangerouslySkipPermissions: !!flow.dangerouslySkipPermissions })}; exit\n`;
}

module.exports = {
  SCHEDULER_INTERVAL_MS, SHELL_INIT_DELAY_MS, MAX_RUN_HISTORY,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS,
  flowPath, logPath,
  AGENT_COMMANDS, getLastRun, shouldRun, buildFlowCommand,
};
