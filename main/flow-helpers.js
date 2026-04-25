const path = require('path');
const { FLOWS_DIR, LOGS_DIR } = require('./paths');
const { createStreamParser } = require('./flow-stream-parser');
const { getLastRun } = require('../shared/flow-utils');

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

// getLastRun imported from shared/flow-utils.js

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
 * Create a size-capped string buffer.
 * Appended data is silently dropped once the cap is reached.
 */
function createCappedBuffer(cap) {
  let buf = '';
  let truncated = false;
  return {
    append(str) {
      if (truncated) return;
      if (buf.length + str.length > cap) {
        buf = buf.slice(0, cap);
        truncated = true;
        return;
      }
      buf += str;
    },
    get value() { return buf; },
    set value(v) { buf = v; },
    get truncated() { return truncated; },
  };
}

/** Handle processData for a parser-backed (Claude) flow. */
function _processWithParser(parser, outputBuf, rawBuf, data) {
  rawBuf.append(data);
  const formatted = parser.push(data);
  if (formatted) outputBuf.append(formatted);
  return formatted || '';
}

/** Flush remaining parser output; fall back to raw buffer if no events parsed. */
function _flushParser(parser, outputBuf, rawBuf) {
  const remaining = parser.flush();
  if (remaining) {
    outputBuf.append(remaining);
    return remaining;
  }
  if (!parser.hasEvents() && rawBuf.value) {
    outputBuf.value = rawBuf.value;
    return rawBuf.value;
  }
  return '';
}

/**
 * Creates an output processor that encapsulates parser selection,
 * buffering, and raw-fallback logic for a flow's PTY output.
 * Caps buffer size at MAX_OUTPUT_BYTES to prevent unbounded memory growth.
 */
function createOutputProcessor(agent) {
  const parser = (agent || 'claude') === 'claude' ? createStreamParser() : null;
  const outputBuf = createCappedBuffer(MAX_OUTPUT_BYTES);
  const rawBuf = createCappedBuffer(MAX_OUTPUT_BYTES);

  return {
    processData(data) {
      if (!parser) { outputBuf.append(data); return data; }
      return _processWithParser(parser, outputBuf, rawBuf, data);
    },
    flush() {
      if (!parser) return '';
      return _flushParser(parser, outputBuf, rawBuf);
    },
    getOutput() {
      if (outputBuf.truncated || rawBuf.truncated) return outputBuf.value + '\n[output truncated at 10 MB]';
      return outputBuf.value;
    },
  };
}

const MAX_FLOW_RUNTIME_MS = 2 * 60 * 60 * 1000; // 2 hours

module.exports = {
  SCHEDULER_INTERVAL_MS, SHELL_INIT_DELAY_MS, MAX_RUN_HISTORY,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS, MAX_FLOW_RUNTIME_MS,
  flowPath, logPath,
  getLastRun, shouldRun, buildFlowCommand,
  createOutputProcessor,
};
