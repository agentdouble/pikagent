/**
 * Tab-manager helpers — pure construction/logic helpers for tab management.
 *
 * Constants, data models, and configuration objects have been extracted to
 * `./tab-constants.js` (issue #260).  They are re-exported here for
 * backward compatibility so existing imports keep working.
 */

// ── Re-export everything from tab-constants for backward compatibility ──
export {
  DRAG_THRESHOLD,
  PANEL_MIN_WIDTH,
  FIT_DELAY_MS,
  SIDE_CONFIG,
  WORKSPACE_PANELS,
  ACTIVITY_BUTTONS,
  SETTINGS_ICON,
  COLOR_GROUPS,
  TAB_DISPOSABLES,
  WorkspaceTab,
  SIDE_VIEWS,
} from './tab-constants.js';

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

/** Find the next tab id to cycle to (skipping noShortcut and mismatched color groups). */
export function findCycleTarget(tabs, activeTabId, step) {
  const ids = Array.from(tabs.keys());
  if (ids.length < 2) return null;
  const idx = ids.indexOf(activeTabId);
  const activeColor = tabs.get(activeTabId)?.colorGroup ?? null;
  for (let i = 1; i < ids.length; i++) {
    const candidate = ids[(idx + step * i + ids.length) % ids.length];
    const tab = tabs.get(candidate);
    if (tab.noShortcut) continue;
    if ((tab.colorGroup ?? null) !== activeColor) continue;
    return candidate;
  }
  return null;
}

/** Find the next tab in a given color group (round-robin from current position). */
export function findColorGroupTarget(tabs, activeTabId, colorGroupId) {
  const ids = Array.from(tabs.keys());
  const currentIdx = ids.indexOf(activeTabId);
  for (let i = 1; i <= ids.length; i++) {
    const candidate = ids[(currentIdx + i) % ids.length];
    const tab = tabs.get(candidate);
    if (tab.colorGroup === colorGroupId && !tab.noShortcut) return candidate;
  }
  return null;
}
