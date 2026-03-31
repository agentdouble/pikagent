/**
 * Pure helpers and constants for board-view.
 * No DOM — deterministic functions that can be tested in isolation.
 */

// Minimum bytes of meaningful output per poll interval to consider agent "working".
// ANSI escape codes (cursor moves, color resets, status bar refreshes) produce
// small data bursts even when idle. Real agent output (streaming text, tool
// results) is much larger. 200 bytes/3s is well above idle noise.
export const DATA_VOLUME_THRESHOLD = 200;
export const POLL_INTERVAL_MS = 3000;
export const FIT_SETTLE_DELAY_MS = 100;
export const FIT_UNHIDE_DELAY_MS = 50;

export const STATUS_CONFIG = {
  running: { label: 'Running', cardClass: 'board-card-running', badgeClass: 'board-card-status board-status-running' },
  waiting: { label: 'Waiting', cardClass: 'board-card-waiting', badgeClass: 'board-card-status board-status-waiting' },
};

/** All card-level CSS classes derived from STATUS_CONFIG — single source of truth for class removal. */
export const ALL_CARD_CLASSES = Object.values(STATUS_CONFIG).map(c => c.cardClass);

export const EVT_CREATED = 'terminal:created';
export const EVT_REMOVED = 'terminal:removed';
export const EVT_EXITED = 'terminal:exited';

/** Terminal options used by board card mini-terminals. */
export const BOARD_TERMINAL_OPTS = {
  fontSize: 11,
  lineHeight: 1.2,
  cursorBlink: false,
  cursorStyle: 'bar',
  scrollback: 10000,
  allowProposedApi: true,
};

/** Declarative table for card header buttons — drives the button row via table-driven loop. */
export const HEADER_BUTTONS = [
  { text: '\u2197', title: 'Go to workspace', action: 'navigate' },
  { text: '\u2212', title: 'Hide',            action: 'hide' },
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

/**
 * Determine card status based on data volume.
 * @param {number} dataBytes - bytes received in the poll interval
 * @returns {'running'|'waiting'}
 */
export function resolveCardStatus(dataBytes) {
  return dataBytes >= DATA_VOLUME_THRESHOLD ? 'running' : 'waiting';
}

/**
 * Find the tab containing a given terminal ID.
 * @param {Map} tabs - tabManager.tabs
 * @param {string} termId
 * @returns {{ tabId: string, tab: object } | null}
 */
export function findTabForTerminal(tabs, termId) {
  for (const [tabId, tab] of tabs) {
    if (tab.terminalPanel?.terminals?.has(termId)) return { tabId, tab };
  }
  return null;
}

/**
 * Get the tab name for a terminal ID.
 * @param {Map} tabs - tabManager.tabs
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
