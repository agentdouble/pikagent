/**
 * TabManager sidebar and workspace helpers — extracted from TabManager class.
 *
 * These functions receive a `deps` object (built by TabManager._deps getter)
 * instead of the full TabManager instance, keeping coupling narrow.
 *
 * Refactored in issue #616 — the ad-hoc deps construction that was duplicated
 * across ~6 call-sites is now centralised in `TabManager.get _deps()`.
 */

import {
  renderActivityBar as doRenderActivityBar,
  detachSidebarView, changeSidebarMode as doChangeSidebarMode,
  disposeSideView as doDisposeSideView, disposeAllSideViews as doDisposeAllSideViews,
} from './sidebar-manager.js';
import {
  renderWorkspace as doRenderWorkspace, reattachLayout,
  capturePanelWidths, disposeAllTabs as doDisposeAllTabs,
} from './workspace-ops.js';
import { getComponent } from './tab-manager-init.js';

export function renderActivityBar(deps) {
  doRenderActivityBar({
    sidebarMode: deps.sidebarMode,
    setSidebarMode: (mode) => deps.tabManager.setSidebarMode(mode),
    onOpenSettings: deps.onOpenSettings,
  });
}

export function setSidebarMode(deps, mode) {
  if (mode === deps.sidebarMode) return;

  doChangeSidebarMode({
    getActiveTab: deps.getActiveTab,
    capturePanelWidths,
    viewStore: deps.viewStore,
    workspaceContainer: deps.workspaceContainer,
    reattachLayout,
    renderWorkspace: deps.renderWorkspace,
    tabManager: deps.tabManager,
    resolveComponent: getComponent,
  }, deps.sidebarMode, mode);
  deps.setSidebarMode(mode);

  deps.renderActivityBar();
}

export async function renderWorkspace(deps, tab, api) {
  return doRenderWorkspace({
    workspaceContainer: deps.workspaceContainer,
    getActiveTabId: deps.getActiveTabId,
    getActiveTab: deps.getActiveTab,
    scheduleAutoSave: deps.scheduleAutoSave,
  }, tab, api, {
    FileTree: getComponent('FileTree'),
    FileViewer: getComponent('FileViewer'),
    TerminalPanel: getComponent('TerminalPanel'),
    WebviewManager: getComponent('WebviewManager'),
    GitChangesView: getComponent('GitChangesView'),
  });
}

export function buildSwitchToDeps(deps) {
  return {
    tabs: deps.tabs,
    getActiveTabId: deps.getActiveTabId,
    setActiveTabId: deps.setActiveTabId,
    getSidebarMode: deps.getSidebarMode,
    setSidebarMode: deps.setSidebarMode,
    workspaceContainer: deps.workspaceContainer,
    renderTabBar: deps.renderTabBar,
    renderActivityBar: deps.renderActivityBar,
    renderWorkspace: deps.renderWorkspace,
    detachSidebarView: (mode) => detachSidebarView({
      getActiveTab: deps.getActiveTab,
      capturePanelWidths,
      viewStore: deps.viewStore,
    }, mode),
  };
}

export function disposeSideView(deps, mode) {
  doDisposeSideView(deps.viewStore, mode);
}

export function disposeAllSideViews(deps) {
  doDisposeAllSideViews(deps.viewStore);
}

export function disposeAllTabs(deps) {
  doDisposeAllTabs({ tabs: deps.tabs, setActiveTabId: deps.setActiveTabId });
}
