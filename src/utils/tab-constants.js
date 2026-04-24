// ── Layout constants ──
export const DRAG_THRESHOLD = 5;
export const PANEL_MIN_WIDTH = 150;
export const FIT_DELAY_MS = 200;

// ── Side panel configuration (single source of truth for side-specific limits & arrows) ──
export const SIDE_CONFIG = {
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
    label: 'SKILLS',
    mode: 'skills',
    icon: '<path d="M12 2 L3 6 L3 12 C3 16.5 7 20.5 12 22 C17 20.5 21 16.5 21 12 L21 6 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8 12 L11 15 L16 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
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

// ── Side-view descriptor table ──
// Each non-"work" sidebar mode owns a view instance and a container element
// on the TabManager.  `pauseOnDetach` means the view is kept alive (paused)
// when switching away, instead of being fully disposed.
export const SIDE_VIEWS = {
  board:  { viewKey: 'boardView',  containerKey: '_boardContainerEl', pauseOnDetach: true },
  flow:   { viewKey: 'flowView',   containerKey: '_flowContainerEl' },
  skills: { viewKey: 'skillsView', containerKey: '_skillsContainerEl' },
  usage:  { viewKey: 'usageView',  containerKey: '_usageContainerEl' },
};
