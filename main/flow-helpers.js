const path = require('path');
const { FLOWS_DIR, LOGS_DIR } = require('./paths');
const { createStreamParser } = require('./flow-stream-parser');

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

/* ── Agent command config (single source of truth) ─────────────── */

const AGENT_CONFIG = {
  claude: {
    permModes: ['--permission-mode auto', '--dangerously-skip-permissions'],
    flags: '--output-format stream-json',
    promptPrefix: '-p',
  },
  codex: {
    permModes: ['--approval-mode auto-edit', '--approval-mode full-auto'],
    flags: '--quiet',
  },
  opencode: {
    promptPrefix: '-p',
  },
};

function _buildAgentCmd(agent, prompt, opts = {}) {
  const cfg = AGENT_CONFIG[agent] || AGENT_CONFIG.claude;
  const parts = [agent];
  if (cfg.permModes) parts.push(cfg.permModes[opts.dangerouslySkipPermissions ? 1 : 0]);
  if (cfg.flags) parts.push(cfg.flags);
  if (cfg.promptPrefix) parts.push(cfg.promptPrefix);
  parts.push(`'${prompt}'`);
  return parts.join(' ');
}

const AGENT_COMMANDS = Object.fromEntries(
  Object.keys(AGENT_CONFIG).map(agent => [
    agent,
    (prompt, opts) => _buildAgentCmd(agent, prompt, opts),
  ]),
);

function getLastRun(flow) {
  return flow.runs?.at(-1) ?? null;
}

/* ── Schedule day filters (single source of truth) ─────────────── */

const SCHEDULE_DAY_FILTER = {
  weekdays: (day) => day !== 0 && day !== 6,
  custom:   (day, schedule) => !schedule.days || schedule.days.includes(day),
};

function _isTimeMatch(schedule, now) {
  if (!schedule.time) return false;
  const [h, m] = schedule.time.split(':').map(Number);
  return now.getHours() === h && now.getMinutes() === m;
}

function _notRunToday(lastRun, now) {
  return !lastRun || lastRun.date !== now.toISOString().slice(0, 10);
}

function shouldRun(flow, now) {
  const { schedule } = flow;
  if (!schedule) return false;

  const lastRun = getLastRun(flow);

  if (schedule.type === 'interval') {
    const intervalMs = (schedule.intervalHours || 1) * MS_PER_HOUR;
    return !lastRun || now.getTime() - new Date(lastRun.timestamp).getTime() >= intervalMs;
  }

  if (!_isTimeMatch(schedule, now)) return false;
  const dayFilter = SCHEDULE_DAY_FILTER[schedule.type] ?? (() => true);
  return dayFilter(now.getDay(), schedule) && _notRunToday(lastRun, now);
}

function buildFlowCommand(flow) {
  const escapedPrompt = flow.prompt.replace(/'/g, "'\\''");
  const agent = flow.agent || 'claude';
  return `${_buildAgentCmd(agent, escapedPrompt, { dangerouslySkipPermissions: !!flow.dangerouslySkipPermissions })}; exit\n`;
}

/**
 * Creates an output processor that encapsulates parser selection,
 * buffering, and raw-fallback logic for a flow's PTY output.
 */
function createOutputProcessor(agent) {
  const parser = (agent || 'claude') === 'claude' ? createStreamParser() : null;
  let outputBuffer = '';
  let rawBuffer = '';

  return {
    processData(data) {
      if (!parser) {
        outputBuffer += data;
        return data;
      }
      rawBuffer += data;
      const formatted = parser.push(data);
      if (formatted) outputBuffer += formatted;
      return formatted || '';
    },

    flush() {
      if (!parser) return '';
      const remaining = parser.flush();
      if (remaining) {
        outputBuffer += remaining;
        return remaining;
      }
      // If no JSON events were parsed, fall back to raw output (claude not found, etc.)
      if (!parser.hasEvents() && rawBuffer) {
        outputBuffer = rawBuffer;
        return rawBuffer;
      }
      return '';
    },

    getOutput() { return outputBuffer; },
  };
}

module.exports = {
  SCHEDULER_INTERVAL_MS, SHELL_INIT_DELAY_MS, MAX_RUN_HISTORY,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS,
  flowPath, logPath,
  AGENT_COMMANDS, getLastRun, shouldRun, buildFlowCommand,
  createOutputProcessor,
};
