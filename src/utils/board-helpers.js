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

export function stripAnsi(text) {
  return String(text || '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, '')
    .replace(/\r/g, '\n');
}

export function appendPreviewChunk(state, chunk, lineLimit = PREVIEW_LINE_LIMIT) {
  const cleaned = stripAnsi(chunk);
  const combined = `${state.remainder || ''}${cleaned}`;
  const parts = combined.split('\n');
  state.remainder = parts.pop() || '';

  const lines = parts
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0);

  state.lines.push(...lines);
  state.lines = state.lines.slice(-lineLimit);
  return state.lines;
}

export function getPreviewText(state) {
  const lines = [...state.lines];
  if (state.remainder?.trim()) lines.push(state.remainder.trimEnd());
  return lines.slice(-PREVIEW_LINE_LIMIT).join('\n');
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
