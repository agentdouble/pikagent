/**
 * Sidebar Manager — extracted from tab-manager.js.
 *
 * Handles activity-bar rendering, sidebar mode switching, and
 * side-view lifecycle (board, flow, usage).
 *
 * Functions receive explicit dependency objects instead of the full
 * TabManager instance.
 *
 * @typedef {Object} ActivityBarDeps
 * @property {string} sidebarMode          - Current sidebar mode ('work', 'board', etc.)
 * @property {Function} setSidebarMode     - Callback to change sidebar mode
 * @property {Function|null} onOpenSettings - Callback for settings button
 *
 * @typedef {Object} SideViewStore
 * @property {Function} getView         - (viewKey) => view instance or null
 * @property {Function} setView         - (viewKey, value) => void
 * @property {Function} getContainer    - (containerKey) => container element or null
 * @property {Function} setContainer    - (containerKey, value) => void
 *
 * @typedef {Object} SideViewDeps
 * @property {HTMLElement} workspaceContainer - Workspace container element
 * @property {SideViewStore} viewStore        - Accessor for view/container instances
 *
 * @typedef {Object} DetachDeps
 * @property {Function} getActiveTab         - () => active WorkspaceTab or null
 * @property {Function} capturePanelWidths   - (tab) => void
 * @property {SideViewStore} viewStore       - Accessor for view/container instances
 */

import { getComponent } from './component-registry.js';
import { _el } from './dom.js';
import { ACTIVITY_BUTTONS, SIDE_VIEWS } from './tab-manager-helpers.js';

/**
 * Declarative map for sidebar view rendering — single source of truth for
 * component name (resolved via registry), constructor args, and post-reattach behavior.
 */
const SIDE_VIEW_RENDERERS = {
  board: {
    componentName: 'BoardView',
    ctorArgs: (extraArgs) => extraArgs.boardCtorArgs || [],
    onReattach: (viewStore) => {
      const boardView = viewStore.getView('boardView');
      if (boardView) {
        for (const [, card] of boardView.cards) {
          try { card.fitAddon.fit(); } catch {}
        }
        boardView.resume();
      }
    },
  },
  flow: {
    componentName: 'FlowView',
    ctorArgs: (extraArgs) => extraArgs.flowCtorArgs || [],
    onReattach: (viewStore) => {
      const flowView = viewStore.getView('flowView');
      if (flowView) flowView.refresh();
    },
  },
  usage: {
    componentName: 'UsageView',
    ctorArgs: () => [],
    onReattach: (viewStore) => {
      const usageView = viewStore.getView('usageView');
      if (usageView) usageView.refresh();
    },
  },
};

// ── Activity Bar ──

/**
 * Render the activity bar with mode buttons and settings.
 * @param {ActivityBarDeps} deps
 */
export function renderActivityBar({ sidebarMode, setSidebarMode, onOpenSettings }) {
  const activityBar = document.getElementById('activity-bar');
  if (!activityBar) return;
  activityBar.replaceChildren();

  const topSection = _el('div', 'activity-bar-top');

  for (const { label, mode } of ACTIVITY_BUTTONS) {
    const btn = _el('button', 'activity-btn', label);
    if (sidebarMode === mode) btn.classList.add('active');
    btn.addEventListener('click', () => setSidebarMode(mode));
    topSection.appendChild(btn);
  }

  topSection.appendChild(_el('button', 'activity-btn', '\u2026'));
  activityBar.appendChild(topSection);

  // Bottom section with settings
  const bottomSection = _el('div', 'activity-bar-bottom');
  const settingsBtn = _el('button', 'activity-btn activity-btn-settings');
  settingsBtn.append(_el('span', 'activity-btn-icon', '\u2699'), 'Settings');
  settingsBtn.addEventListener('click', () => {
    if (onOpenSettings) onOpenSettings();
  });
  bottomSection.appendChild(settingsBtn);

  activityBar.appendChild(bottomSection);
}

// ── Side view rendering ──

/**
 * Reattach or create a side-panel view (board, flow, usage). Returns true if reattached.
 * @param {SideViewDeps} deps
 * @param {string} viewKey       - Property key for the view instance
 * @param {string} containerKey  - Property key for the container element
 * @param {Function} ViewClass   - Constructor for the view
 * @param {...*} ctorArgs        - Arguments for the ViewClass constructor
 * @returns {boolean}
 */
export function renderSideView({ workspaceContainer, viewStore }, viewKey, containerKey, ViewClass, ...ctorArgs) {
  workspaceContainer.replaceChildren();

  if (viewStore.getView(viewKey) && viewStore.getContainer(containerKey)) {
    workspaceContainer.appendChild(viewStore.getContainer(containerKey));
    return true;
  }

  const container = _el('div');
  container.style.height = '100%';
  workspaceContainer.appendChild(container);
  viewStore.setContainer(containerKey, container);
  viewStore.setView(viewKey, new ViewClass(container, ...ctorArgs));
  return false;
}

/**
 * Activate a side view by mode using SIDE_VIEW_RENDERERS config.
 * @param {SideViewDeps} deps
 * @param {string} mode         - Side view mode (board, flow, usage)
 * @param {Object} extraArgs    - Additional constructor args per mode
 */
export function activateSideView(deps, mode, extraArgs = {}) {
  const sideView = SIDE_VIEWS[mode];
  const renderer = SIDE_VIEW_RENDERERS[mode];
  if (!sideView || !renderer) return;
  const ViewClass = getComponent(renderer.componentName);
  const reattached = renderSideView(
    deps, sideView.viewKey, sideView.containerKey,
    ViewClass, ...renderer.ctorArgs(extraArgs),
  );
  if (reattached) renderer.onReattach(deps.viewStore);
}

// ── Side view detach / disposal ──

/**
 * Detach the current sidebar view when switching modes.
 * @param {DetachDeps} deps
 * @param {string} mode  - Mode being detached from
 */
export function detachSidebarView({ getActiveTab, capturePanelWidths, viewStore }, mode) {
  if (mode === 'work') {
    const prev = getActiveTab();
    if (prev?.layoutElement) {
      capturePanelWidths(prev);
      prev.layoutElement.remove();
    }
    return;
  }
  const cfg = SIDE_VIEWS[mode];
  if (!cfg) return;
  if (cfg.pauseOnDetach) {
    const view = viewStore.getView(cfg.viewKey);
    if (view) view.pause();
    const container = viewStore.getContainer(cfg.containerKey);
    if (container) container.remove();
  } else {
    disposeSideView(viewStore, mode);
  }
}

/**
 * Dispose a single side view by mode.
 * @param {SideViewStore} viewStore
 * @param {string} mode
 */
export function disposeSideView(viewStore, mode) {
  const cfg = SIDE_VIEWS[mode];
  if (!cfg) return;
  const view = viewStore.getView(cfg.viewKey);
  if (view) {
    view.dispose();
    viewStore.setView(cfg.viewKey, null);
  }
  const container = viewStore.getContainer(cfg.containerKey);
  if (container) {
    container.remove();
    viewStore.setContainer(cfg.containerKey, null);
  }
}

/**
 * Dispose all side views.
 * @param {SideViewStore} viewStore
 */
export function disposeAllSideViews(viewStore) {
  for (const mode of Object.keys(SIDE_VIEWS)) disposeSideView(viewStore, mode);
}
