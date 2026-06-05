/**
 * Pure helpers and constants for board-view.
 * No DOM — deterministic functions that can be tested in isolation.
 */

import { findTabForTerminal } from './tab-lifecycle.js';
export { findTabForTerminal };

// Minimum bytes of meaningful output per poll interval to consider agent "working".
// ANSI escape codes (cursor moves, color resets, status bar refreshes) produce
// small data bursts even when idle. Real agent output (streaming text, tool
// results) is much larger. 200 bytes/3s is well above idle noise.
export const DATA_VOLUME_THRESHOLD = 200;
export const POLL_INTERVAL_MS = 3000;
export const PREVIEW_LINE_LIMIT = 8;
export const REPLY_RESPONSE_LINE_LIMIT = 6;
export const REPLY_HISTORY_LIMIT = 3;

export const STATUS_CONFIG = {
  running: { label: 'Running', cardClass: 'board-card-running', badgeClass: 'board-card-status board-status-running' },
  waiting: { label: 'Waiting', cardClass: 'board-card-waiting', badgeClass: 'board-card-status board-status-waiting' },
};

/** All card-level CSS classes derived from STATUS_CONFIG — single source of truth for class removal. */
export const ALL_CARD_CLASSES = Object.values(STATUS_CONFIG).map(c => c.cardClass);

/** Declarative table for card header buttons — drives the button row via table-driven loop. */
export const HEADER_BUTTONS = [
  { text: '\u2197', title: 'Open terminal', action: 'navigate' },
  { text: '\u25A0', title: 'Stop terminal', action: 'stop', cls: 'board-card-btn-danger' },
  { text: '\u2212', title: 'Hide',          action: 'hide' },
];

/**
 * Format a card label from agent name and tab name.
 * @param {string} agent
 * @param {string} tabName
 * @returns {string}
 */
export function formatCardLabel(agent, tabName) {
  return `${agent} \u2014 ${tabName}`;
}

export function formatShortPath(cwd, fallback = '-') {
  if (!cwd) return fallback;
  const parts = String(cwd).split('/').filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `.../${parts.slice(-2).join('/')}`;
}

export function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 1000) return 'now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function applyBackspaces(text) {
  const chars = [];
  for (const char of text) {
    if (char === '\b') chars.pop();
    else chars.push(char);
  }
  return chars.join('');
}

export function stripAnsi(text) {
  const withoutEscapes = String(text || '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[P^_][\s\S]*?(?:\x1B\\|\x07)/g, '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B[()][A-Za-z0-9]/g, '')
    .replace(/\x1B[@-Z\\-_]/g, '');

  return applyBackspaces(withoutEscapes)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function appendPreviewChunk(state, chunk, lineLimit = PREVIEW_LINE_LIMIT) {
  const cleaned = stripAnsi(chunk);
  let i = 0;

  const commitLine = () => {
    const line = (state.remainder || '').trimEnd();
    if (line.trim()) state.lines.push(line);
    state.remainder = '';
  };

  if (state.pendingCarriageReturn) {
    if (cleaned[0] === '\n') {
      commitLine();
      i = 1;
    } else {
      state.remainder = '';
    }
    state.pendingCarriageReturn = false;
  }

  for (; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (char === '\r') {
      if (i + 1 >= cleaned.length) {
        state.pendingCarriageReturn = true;
      } else if (cleaned[i + 1] === '\n') {
        commitLine();
        i += 1;
      } else {
        state.remainder = '';
      }
    } else if (char === '\n') {
      commitLine();
    } else {
      state.remainder = `${state.remainder || ''}${char}`;
    }
  }

  state.lines = state.lines.slice(-lineLimit);
  return state.lines;
}

export function getPreviewText(state) {
  const lines = [...state.lines];
  if (state.remainder?.trim()) lines.push(state.remainder.trimEnd());
  return formatBoardPreviewLines(lines);
}

export function getPreviewState(state) {
  const lines = [...state.lines];
  if (state.remainder?.trim()) lines.push(state.remainder.trimEnd());
  return formatBoardPreviewState(lines);
}

function cleanBufferLine(text) {
  return stripAnsi(text).replace(/[\r\n]/g, '').trimEnd();
}

function isAgentResponseStart(line) {
  return /^\s*•\s+/.test(line);
}

function isPromptLine(line) {
  return /^\s*›\s+/.test(line);
}

function isDividerLine(line) {
  const trimmed = String(line || '').trim();
  return trimmed.length >= 5 && /^[─━═\-_=]+$/.test(trimmed);
}

function isStatusLine(line) {
  const text = String(line || '').trim();
  return /^(gpt|claude|codex|gemini|sonnet|opus|o\d)[\w.-]*(\s|$)/i.test(text)
    && /(\s·\s|~|fast|xhigh|high|medium|low)/i.test(text);
}

function isPromptTemplateLine(line) {
  return /^\s*Implement\s+\{feature\}\s*$/i.test(String(line || '').trim());
}

function isTransientAgentStateLine(line) {
  const text = String(line || '')
    .trim()
    .replace(/^[•◦●○◌◇◆✦✧⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*/, '');
  return /^(working|thinking|think|messages?)(?:[\s.:…-].*)?$/i.test(text);
}

function cleanTransientAgentStateLine(line) {
  return String(line || '')
    .trim()
    .replace(/^[•◦●○◌◇◆✦✧⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s*/, '')
    .trim();
}

function isBoardPreviewBoundary(line) {
  return isPromptLine(line)
    || isDividerLine(line)
    || isStatusLine(line)
    || isPromptTemplateLine(line)
    || isTransientAgentStateLine(line);
}

function findLatestAgentResponseStart(lines) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (isAgentResponseStart(lines[i])) return i;
  }
  return -1;
}

function latestAgentResponseLines(lines, start = findLatestAgentResponseStart(lines)) {
  if (start === -1) return [];

  const response = [];
  for (let i = start; i < lines.length; i += 1) {
    const line = lines[i];
    if (i > start && isBoardPreviewBoundary(line)) break;
    response.push(i === start ? line.replace(/^\s*•\s+/, '') : line);
  }

  while (response.length > 0 && !response[0].trim()) response.shift();
  while (response.length > 0 && !response[response.length - 1].trim()) response.pop();
  return response;
}

function latestTransientAgentState(lines, start = 0) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (i < start) break;
    if (isTransientAgentStateLine(lines[i])) return cleanTransientAgentStateLine(lines[i]);
  }
  return '';
}

export function formatBoardPreviewState(lines, lineLimit = PREVIEW_LINE_LIMIT) {
  const cleanedLines = lines
    .map((line) => String(line || '').trimEnd())
    .filter((line) => line.trim());
  const responseStart = findLatestAgentResponseStart(cleanedLines);
  const responseLines = latestAgentResponseLines(cleanedLines, responseStart);
  const displayLines = responseLines.length > 0
    ? responseLines
    : cleanedLines.filter((line) => !isBoardPreviewBoundary(line));
  return {
    text: displayLines.slice(-lineLimit).join('\n'),
    transientText: latestTransientAgentState(
      cleanedLines,
      responseStart === -1 ? 0 : responseStart + 1,
    ),
  };
}

export function formatBoardPreviewLines(lines, lineLimit = PREVIEW_LINE_LIMIT) {
  return formatBoardPreviewState(lines, lineLimit).text;
}

function getTerminalBufferLines(terminal, lineLimit = PREVIEW_LINE_LIMIT) {
  const buffer = terminal?.buffer?.active;
  if (!buffer || typeof buffer.getLine !== 'function') return [];

  const length = Number.isFinite(buffer.length) ? buffer.length : 0;
  if (length <= 0) return [];

  const rows = Number.isFinite(terminal.rows) && terminal.rows > 0
    ? terminal.rows
    : Math.min(length, Math.max(lineLimit, 24));
  const baseY = Number.isFinite(buffer.baseY)
    ? buffer.baseY
    : Math.max(0, length - rows);
  const end = Math.min(length, baseY + rows);
  const start = Math.max(0, end - Math.max(rows, lineLimit * 3));
  const lines = [];

  for (let i = start; i < end; i += 1) {
    const line = buffer.getLine(i);
    const text = cleanBufferLine(line?.translateToString?.(true) ?? '');
    if (!text.trim()) continue;

    if (line?.isWrapped && lines.length > 0) {
      lines[lines.length - 1] = `${lines[lines.length - 1]}${text}`;
    } else {
      lines.push(text);
    }
  }

  return lines;
}

export function getTerminalBufferPreviewState(terminal, lineLimit = PREVIEW_LINE_LIMIT) {
  return formatBoardPreviewState(getTerminalBufferLines(terminal, lineLimit), lineLimit);
}

export function getTerminalBufferPreview(terminal, lineLimit = PREVIEW_LINE_LIMIT) {
  return getTerminalBufferPreviewState(terminal, lineLimit).text;
}

const BOARD_REPLY_ENTER_DELAY_MS = 20;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendBoardReply(termId, value, writeFn, opts = {}) {
  const text = String(value || '').trim();
  if (!text) return false;
  const enterDelayMs = Number.isFinite(opts.enterDelayMs)
    ? Math.max(0, opts.enterDelayMs)
    : BOARD_REPLY_ENTER_DELAY_MS;

  await writeFn(termId, text);
  await wait(enterDelayMs);
  await writeFn(termId, '\r');
  return true;
}

export function cleanReplyResponseText(text, sentText) {
  const sent = String(sentText || '').trim();
  const lines = String(text || '').split('\n');

  while (sent && lines.length > 0 && lines[0].trim() === sent) {
    lines.shift();
  }

  return lines.join('\n').trim();
}

/**
 * Determine card status based on data volume.
 * @param {number} dataBytes - bytes received in the poll interval
 * @returns {'running'|'waiting'}
 */
export function resolveCardStatus(dataBytes) {
  return dataBytes >= DATA_VOLUME_THRESHOLD ? 'running' : 'waiting';
}

/**
 * Get the tab name for a terminal ID.
 * @param {Map<string, import('./tab-types.js').WorkspaceTab>} tabs - tabManager.tabs
 * @param {string} termId
 * @returns {string|null}
 */
export function getTabNameForTerminal(tabs, termId) {
  return findTabForTerminal(tabs, termId)?.tab.name ?? null;
}

/** Direction → step delta for focus navigation. */
const DIRECTION_DELTAS = { left: -1, up: -1, right: 1, down: 1 };

/**
 * Compute the next focus index given direction and card count, with wrap-around.
 * @param {number} currentIndex - current focused index (-1 if none)
 * @param {'left'|'right'|'up'|'down'} direction
 * @param {number} count - number of visible cards
 * @returns {number}
 */
export function computeFocusIndex(currentIndex, direction, count) {
  if (currentIndex === -1) return 0;
  const delta = DIRECTION_DELTAS[direction] ?? 1;
  return (currentIndex + delta + count) % count;
}
