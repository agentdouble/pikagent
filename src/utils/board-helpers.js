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

export const EVT_CREATED = 'terminal:created';
export const EVT_REMOVED = 'terminal:removed';
export const EVT_EXITED = 'terminal:exited';

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

/**
 * Compute the next focus index given direction and card count, with wrap-around.
 * @param {number} currentIndex - current focused index (-1 if none)
 * @param {'left'|'right'|'up'|'down'} direction
 * @param {number} count - number of visible cards
 * @returns {number}
 */
export function computeFocusIndex(currentIndex, direction, count) {
  if (currentIndex === -1) return 0;
  if (direction === 'left' || direction === 'up') {
    return (currentIndex - 1 + count) % count;
  }
  return (currentIndex + 1) % count;
}
