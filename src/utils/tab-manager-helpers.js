// ── Layout constants ──
export const DRAG_THRESHOLD = 5;
export const PANEL_MIN_WIDTH = 150;
export const FIT_DELAY_MS = 200;

// ── Side panel configuration (single source of truth for side-specific limits & arrows) ──
const SIDE_CONFIG = {
  left:  { maxWidth: 500,  arrows: { collapsed: '\u2192', expanded: '\u2190' } },
  right: { maxWidth: 1400, arrows: { collapsed: '\u2190', expanded: '\u2192' } },
};

/**
 * Workspace side-panel definitions — single source of truth for panel structure,
 * content class, optional header title, and serialization keys.
 * Drives _buildSidePanel, _capturePanelWidths, and _restorePanelSizes in tab-manager.
 */
export const WORKSPACE_PANELS = [
  { side: 'left',  contentCls: 'file-tree',   title: 'Explorer', widthKey: 'leftWidth',  collapsedKey: 'leftCollapsed' },
  { side: 'right', contentCls: 'file-viewer',                    widthKey: 'rightWidth', collapsedKey: 'rightCollapsed' },
];

// ── Activity bar buttons ──
// `icon` uses inline SVG path data, rendered by sidebar-manager.
export const ACTIVITY_BUTTONS = [
  {
    label: 'WORK',
    mode: 'work',
    icon: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  },
  {
    label: 'BOARD',
    mode: 'board',
    icon: '<rect x="3" y="4" width="18" height="4" rx="1.5"/><rect x="3" y="11" width="18" height="4" rx="1.5"/><rect x="3" y="18" width="18" height="3" rx="1.5"/>',
  },
  {
    label: 'FLOW',
    mode: 'flow',
    icon: '<path d="M4 17 L9 12 L13 15 L20 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="12" r="1.5"/><circle cx="13" cy="15" r="1.5"/>',
  },
  {
    label: 'USAGE',
    mode: 'usage',
    icon: '<path d="M4 18 L10 12 L14 16 L20 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 8 L20 8 L20 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  },
];

export const SETTINGS_ICON = '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M19.4 13.6a7.7 7.7 0 0 0 0-3.2l2.1-1.7-2-3.4-2.5 1a7.5 7.5 0 0 0-2.8-1.6L13.8 2h-3.6l-.4 2.7a7.5 7.5 0 0 0-2.8 1.6l-2.5-1-2 3.4 2.1 1.7a7.7 7.7 0 0 0 0 3.2l-2.1 1.7 2 3.4 2.5-1a7.5 7.5 0 0 0 2.8 1.6l.4 2.7h3.6l.4-2.7a7.5 7.5 0 0 0 2.8-1.6l2.5 1 2-3.4-2.1-1.7Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';

// ── Color groups ──
export const COLOR_GROUPS = [
  { id: 'red', label: 'Red', color: '#e94560' },
  { id: 'blue', label: 'Blue', color: '#74c0fc' },
  { id: 'green', label: 'Green', color: '#51cf66' },
  { id: 'yellow', label: 'Yellow', color: '#ffd43b' },
  { id: 'purple', label: 'Purple', color: '#b197fc' },
  { id: 'orange', label: 'Orange', color: '#ffa94d' },
];

// ── Tab disposal ──
/** Disposable component keys on a WorkspaceTab — drives generic _disposeTab. */
export const TAB_DISPOSABLES = ['terminalPanel', 'fileViewer', 'fileTree'];

// ── Pure data model ──
export class WorkspaceTab {
  constructor(id, name, cwd) {
    this.id = id;
    this.name = name;
    this.cwd = cwd;
    this.userNamed = false;
    this.noShortcut = false;
    this.colorGroup = null;
    this.fileTree = null;
    this.terminalPanel = null;
    this.fileViewer = null;
    this.layoutElement = null;
    this.pathTextEl = null;
    this.branchBadgeEl = null;
    this._panelWidths = null;
    /**
     * When set, this tab owns a git worktree and should offer cleanup on close.
     * Shape: { mainRepoCwd: string, worktreePath: string }
     * @type {{ mainRepoCwd: string, worktreePath: string } | null}
     */
    this.worktree = null;
  }
}

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

// ── Side-view descriptor table ──
// Each non-"work" sidebar mode owns a view instance and a container element
// on the TabManager.  `pauseOnDetach` means the view is kept alive (paused)
// when switching away, instead of being fully disposed.
export const SIDE_VIEWS = {
  board: { viewKey: 'boardView', containerKey: '_boardContainerEl', pauseOnDetach: true },
  flow:  { viewKey: 'flowView',  containerKey: '_flowContainerEl' },
  usage: { viewKey: 'usageView', containerKey: '_usageContainerEl' },
};

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
