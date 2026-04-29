/**
 * Sidebar Manager — extracted from tab-manager.js.
 *
 * Handles activity-bar rendering, sidebar mode switching, and
 * side-view lifecycle (board, flow, usage).
 *
 * Functions receive explicit dependency objects instead of the full
 * TabManager instance.
 *
 * @typedef {{ sidebarMode: string, setSidebarMode: (mode: string) => void, onOpenSettings: (() => void)|null }} ActivityBarDeps
 *
 * @typedef {{ getView: (viewKey: string) => unknown, setView: (viewKey: string, value: unknown) => void, getContainer: (containerKey: string) => HTMLElement|null, setContainer: (containerKey: string, value: HTMLElement|null) => void }} SideViewStore
 *
 * @typedef {{ workspaceContainer: HTMLElement, viewStore: SideViewStore }} SideViewDeps
 *
 * @typedef {{ getActiveTab: () => import('./tab-types.js').WorkspaceTab|null, capturePanelWidths: (tab: import('./tab-types.js').WorkspaceTab) => void, viewStore: SideViewStore }} DetachDeps
 */

import { _el, renderList } from './workspace-dom.js';
import { ACTIVITY_BUTTONS, SETTINGS_ICON, SIDE_VIEWS } from './tab-constants.js';
import { createAsyncHandler } from './event-helpers.js';

function buildActivityButton(label, iconSvg, extraClass = '') {
  const btn = _el('button', `activity-btn ${extraClass}`.trim());
  const iconWrap = _el('span', 'activity-btn-icon');
  iconWrap.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">${iconSvg}</svg>`;
  btn.append(iconWrap, _el('span', 'activity-btn-label', label));
  return btn;
}

/**
 * Declarative map for sidebar view rendering — single source of truth for
 * component name (resolved via injected resolver), constructor args, and post-reattach behavior.
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
  skills: {
    componentName: 'SkillsView',
    ctorArgs: () => [],
    onReattach: (viewStore) => {
      const skillsView = viewStore.getView('skillsView');
      if (skillsView) skillsView.refresh();
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
  renderList(topSection, ACTIVITY_BUTTONS, ({ label, mode, icon }) => {
    const btn = buildActivityButton(label, icon);
    btn.dataset.mode = mode;
    if (sidebarMode === mode) btn.classList.add('active');
    btn.addEventListener('click', () => setSidebarMode(mode));
    return btn;
  });

  activityBar.appendChild(topSection);

  // Bottom section with settings
  const bottomSection = _el('div', 'activity-bar-bottom');
  const settingsBtn = buildActivityButton('SETTINGS', SETTINGS_ICON, 'activity-btn-settings');
  settingsBtn.addEventListener('click', createAsyncHandler(
    { stopProp: false, guard: () => !!onOpenSettings },
    () => onOpenSettings(),
  ));
  bottomSection.appendChild(settingsBtn);

  activityBar.appendChild(bottomSection);
}

// ── Side view rendering ──

/**
 * Reattach or create a side-panel view (board, flow, usage). Returns true if reattached.
 * @param {SideViewDeps} deps
 * @param {string} viewKey       - Property key for the view instance
 * @param {string} containerKey  - Property key for the container element
 * @param {new (container: HTMLElement, ...args: unknown[]) => unknown} ViewClass   - Constructor for the view
 * @param {...unknown} ctorArgs  - Arguments for the ViewClass constructor
 * @returns {boolean}
 */
function renderSideView({ workspaceContainer, viewStore }, viewKey, containerKey, ViewClass, ...ctorArgs) {
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
 * @param {SideViewDeps & { resolveComponent: (name: string) => Function }} deps
 * @param {string} mode         - Side view mode (board, flow, usage)
 * @param {{ boardCtorArgs?: unknown[], flowCtorArgs?: unknown[] }} extraArgs - Additional constructor args per mode
 */
function activateSideView(deps, mode, extraArgs = {}) {
  const sideView = SIDE_VIEWS[mode];
  const renderer = SIDE_VIEW_RENDERERS[mode];
  if (!sideView || !renderer) return;
  const ViewClass = deps.resolveComponent(renderer.componentName);
  const reattached = renderSideView(
    deps, sideView.viewKey, sideView.containerKey,
    ViewClass, ...renderer.ctorArgs(extraArgs),
  );
  if (reattached) renderer.onReattach(deps.viewStore);
}

// ── Sidebar mode switching ──

/**
 * Switch sidebar mode: detach current view, activate new view (or re-attach work layout).
 *
 * @typedef {{ getActiveTab: () => import('./tab-types.js').WorkspaceTab|null, capturePanelWidths: (tab: import('./tab-types.js').WorkspaceTab) => void, viewStore: SideViewStore, workspaceContainer: HTMLElement, reattachLayout: (deps: { workspaceContainer: HTMLElement }, tab: import('./tab-types.js').WorkspaceTab) => void, renderWorkspace: (tab: import('./tab-types.js').WorkspaceTab) => void, tabManager: unknown, resolveComponent: (name: string) => Function }} ChangeSidebarModeDeps
 */

/**
 * @param {ChangeSidebarModeDeps} deps
 * @param {string} currentMode  - Current sidebar mode
 * @param {string} newMode      - Target sidebar mode
 */
export function changeSidebarMode(deps, currentMode, newMode) {
  detachSidebarView({
    getActiveTab: deps.getActiveTab,
    capturePanelWidths: deps.capturePanelWidths,
    viewStore: deps.viewStore,
  }, currentMode);

  if (newMode !== 'work') {
    activateSideView({
      workspaceContainer: deps.workspaceContainer,
      viewStore: deps.viewStore,
      resolveComponent: deps.resolveComponent,
    }, newMode, {
      boardCtorArgs: [deps.tabManager],
      flowCtorArgs: [deps.tabManager],
    });
  } else {
    const tab = deps.getActiveTab();
    if (tab?.layoutElement) deps.reattachLayout({ workspaceContainer: deps.workspaceContainer }, tab);
    else if (tab) deps.renderWorkspace(tab);
  }
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
