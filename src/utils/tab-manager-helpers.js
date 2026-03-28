// ── Layout constants ──
export const DRAG_THRESHOLD = 5;
export const PANEL_MIN_WIDTH = 150;
export const LEFT_MAX_WIDTH = 500;
export const RIGHT_MAX_WIDTH = 1400;
export const FIT_DELAY_MS = 200;

// ── Activity bar buttons ──
export const ACTIVITY_BUTTONS = [
  { label: 'work', mode: 'work' },
  { label: 'BOARD', mode: 'board' },
  { label: 'FLOW', mode: 'flow' },
  { label: 'USAGE', mode: 'usage' },
];

// ── Color groups ──
export const COLOR_GROUPS = [
  { id: 'red', label: 'Red', color: '#e94560' },
  { id: 'blue', label: 'Blue', color: '#74c0fc' },
  { id: 'green', label: 'Green', color: '#51cf66' },
  { id: 'yellow', label: 'Yellow', color: '#ffd43b' },
  { id: 'purple', label: 'Purple', color: '#b197fc' },
  { id: 'orange', label: 'Orange', color: '#ffa94d' },
];

// ── Pure data model ──
export class WorkspaceTab {
  constructor(id, name, cwd) {
    this.id = id;
    this.name = name;
    this.cwd = cwd;
    this.noShortcut = false;
    this.colorGroup = null;
    this.fileTree = null;
    this.terminalPanel = null;
    this.fileViewer = null;
    this.layoutElement = null;
    this.pathTextEl = null;
    this.branchBadgeEl = null;
    this._panelWidths = null;
  }
}

// ── Pure helpers ──

/** Clamp a panel width between min and side-specific max. */
export function clampPanelWidth(newWidth, side) {
  const max = side === 'right' ? RIGHT_MAX_WIDTH : LEFT_MAX_WIDTH;
  return Math.max(PANEL_MIN_WIDTH, Math.min(max, newWidth));
}

/** Return arrow text and title for a collapsible panel. */
export function panelArrowState(side, isCollapsed) {
  if (side === 'left') {
    return {
      text: isCollapsed ? '\u2192' : '\u2190',
      title: isCollapsed ? 'Expand left panel' : 'Collapse left panel',
    };
  }
  return {
    text: isCollapsed ? '\u2190' : '\u2192',
    title: isCollapsed ? 'Expand right panel' : 'Collapse right panel',
  };
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
