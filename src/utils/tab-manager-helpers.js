/**
 * Tab manager helpers — pure helper functions for tab management.
 *
 * Constants live in ./tab-constants.js
 * The WorkspaceTab class lives in ./tab-types.js
 *
 * This file contains ONLY the pure helpers (clampPanelWidth, panelArrowState,
 * reorderEntries, findCycleMatch, findCycleTarget, findColorGroupTarget).
 */

import { PANEL_MIN_WIDTH, SIDE_CONFIG } from './tab-constants.js';

// ── Pure helpers ──

/** Clamp a panel width between min and side-specific max. */
export function clampPanelWidth(newWidth, side) {
  return Math.max(PANEL_MIN_WIDTH, Math.min(SIDE_CONFIG[side].maxWidth, newWidth));
}

/** Return arrow text and title for a collapsible panel. */
export function panelArrowState(side, isCollapsed) {
  const { arrows } = SIDE_CONFIG[side];
  const state = isCollapsed ? 'collapsed' : 'expanded';
  const action = isCollapsed ? 'Expand' : 'Collapse';
  return { text: arrows[state], title: `${action} ${side} panel` };
}

/** Reorder map entries: move `fromId` next to `toId` (before or after). Returns new entries array. */
export function reorderEntries(entries, fromId, toId, before) {
  const copy = [...entries];
  const fromIdx = copy.findIndex(([id]) => id === fromId);
  const fromEntry = copy.splice(fromIdx, 1)[0];
  let toIdx = copy.findIndex(([id]) => id === toId);
  if (!before) toIdx++;
  copy.splice(toIdx, 0, fromEntry);
  return copy;
}

/**
 * Walk an array starting from `startIdx`, stepping by `step` (wrapping around),
 * and return the first element that satisfies `predicate`.
 *
 * Shared by findCycleTarget and findColorGroupTarget to eliminate the duplicated
 * round-robin loop pattern.
 *
 * @template T
 * @param {T[]} items      — the array to walk
 * @param {number} startIdx — starting index (the current / active position)
 * @param {number} step     — direction: +1 or -1
 * @param {(item: T) => boolean} predicate — return true for a match
 * @returns {T|null} the first matching item, or null if none found
 */
export function findCycleMatch(items, startIdx, step, predicate) {
  const len = items.length;
  for (let i = 1; i < len; i++) {
    const item = items[(startIdx + step * i + len) % len];
    if (predicate(item)) return item;
  }
  return null;
}

/** Find the next tab id to cycle to (skipping noShortcut and mismatched color groups). */
export function findCycleTarget(tabs, activeTabId, step) {
  const ids = Array.from(tabs.keys());
  if (ids.length < 2) return null;
  const idx = ids.indexOf(activeTabId);
  const activeColor = tabs.get(activeTabId)?.colorGroup ?? null;
  return findCycleMatch(ids, idx, step, (candidate) => {
    const tab = tabs.get(candidate);
    if (tab.noShortcut) return false;
    return (tab.colorGroup ?? null) === activeColor;
  });
}

/** Find the next tab in a given color group (round-robin from current position). */
export function findColorGroupTarget(tabs, activeTabId, colorGroupId) {
  const ids = Array.from(tabs.keys());
  const currentIdx = ids.indexOf(activeTabId);
  return findCycleMatch(ids, currentIdx, 1, (candidate) => {
    const tab = tabs.get(candidate);
    return tab.colorGroup === colorGroupId && !tab.noShortcut;
  });
}
