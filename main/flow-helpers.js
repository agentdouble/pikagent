const path = require('path');
const { FLOWS_DIR, LOGS_DIR } = require('./paths');
const { createStreamParser } = require('./flow-stream-parser');
const { getLastRun } = require('../shared/flow-utils');
const { AGENT_IDS } = require('../shared/agent-registry');

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

/* ── Agent command config ───────────────────────────────────────── */

const _AGENT_CMD_OVERRIDES = {
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

/** Derived from the shared agent registry + per-agent command overrides. */
const AGENT_CONFIG = Object.fromEntries(
  AGENT_IDS.map((id) => [id, _AGENT_CMD_OVERRIDES[id] || {}]),
);

function _buildAgentCmd(agent, prompt, opts = {}) {
  const cfg = AGENT_CONFIG[agent] || AGENT_CONFIG.claude;
  const parts = [agent];
  if (cfg.permModes) parts.push(cfg.permModes[opts.dangerouslySkipPermissions ? 1 : 0]);
  if (cfg.flags) parts.push(cfg.flags);
  if (cfg.promptPrefix) parts.push(cfg.promptPrefix);
  parts.push(`'${prompt}'`);
  return parts.join(' ');
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

const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB cap per flow

/**
 * Creates an output processor that encapsulates parser selection,
 * buffering, and raw-fallback logic for a flow's PTY output.
 * Caps buffer size at MAX_OUTPUT_BYTES to prevent unbounded memory growth.
 */
function _createSafeAppender(maxBytes) {
  let buffer = '';
  let truncated = false;
  return {
    append(str) {
      if (truncated) return;
      if (buffer.length + str.length > maxBytes) {
        buffer = buffer.slice(0, maxBytes);
        truncated = true;
        return;
      }
      buffer += str;
    },
    get() { return buffer; },
    set(val) { buffer = val; },
    isTruncated() { return truncated; },
  };
}

function createOutputProcessor(agent) {
  const parser = (agent || 'claude') === 'claude' ? createStreamParser() : null;
  const output = _createSafeAppender(MAX_OUTPUT_BYTES);
  const raw = _createSafeAppender(MAX_OUTPUT_BYTES);

  return {
    processData(data) {
      if (!parser) {
        output.append(data);
        return data;
      }
      raw.append(data);
      const formatted = parser.push(data);
      if (formatted) output.append(formatted);
      return formatted || '';
    },

    flush() {
      if (!parser) return '';
      const remaining = parser.flush();
      if (remaining) {
        output.append(remaining);
        return remaining;
      }
      // If no JSON events were parsed, fall back to raw output (claude not found, etc.)
      if (!parser.hasEvents() && raw.get()) {
        output.set(raw.get());
        return raw.get();
      }
      return '';
    },

    getOutput() {
      if (output.isTruncated() || raw.isTruncated()) return output.get() + '\n[output truncated at 10 MB]';
      return output.get();
    },
  };
}

const MAX_FLOW_RUNTIME_MS = 2 * 60 * 60 * 1000; // 2 hours

module.exports = {
  SCHEDULER_INTERVAL_MS, SHELL_INIT_DELAY_MS, MAX_RUN_HISTORY,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS, MAX_FLOW_RUNTIME_MS,
  logPath,
  shouldRun, buildFlowCommand,
  createOutputProcessor,
};
