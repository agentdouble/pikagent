/**
 * TabManager sidebar and workspace helpers — extracted from TabManager class.
 *
 * These functions build the deps objects and call into sidebar-manager and
 * workspace-ops on behalf of the TabManager.  State is passed in via the
 * `tm` (TabManager instance) parameter.
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
import { buildViewStore } from './tab-facade.js';

export function renderActivityBar(tm) {
  doRenderActivityBar({
    sidebarMode: tm.sidebarMode,
    setSidebarMode: (mode) => tm.setSidebarMode(mode),
    onOpenSettings: tm.onOpenSettings,
  });
}

export function setSidebarMode(tm, mode) {
  if (mode === tm.sidebarMode) return;

  doChangeSidebarMode({
    getActiveTab: () => tm._activeTab(),
    capturePanelWidths,
    viewStore: buildViewStore(tm),
    workspaceContainer: tm.workspaceContainer,
    reattachLayout,
    renderWorkspace: (tab) => tm.renderWorkspace(tab),
    tabManager: tm,
    resolveComponent: getComponent,
  }, tm.sidebarMode, mode);
  tm.sidebarMode = mode;

  tm.renderActivityBar();
}

export async function renderWorkspace(tm, tab, api) {
  return doRenderWorkspace({
    workspaceContainer: tm.workspaceContainer,
    getActiveTabId: () => tm.activeTabId,
    getActiveTab: () => tm._activeTab(),
    scheduleAutoSave: () => tm.configManager.scheduleAutoSave(),
  }, tab, api, {
    FileTree: getComponent('FileTree'),
    FileViewer: getComponent('FileViewer'),
    TerminalPanel: getComponent('TerminalPanel'),
    WebviewManager: getComponent('WebviewManager'),
    GitChangesView: getComponent('GitChangesView'),
  });
}

export function buildSwitchToDeps(tm) {
  return {
    tabs: tm.tabs,
    getActiveTabId: () => tm.activeTabId,
    setActiveTabId: (newId) => { tm.activeTabId = newId; },
    getSidebarMode: () => tm.sidebarMode,
    setSidebarMode: (mode) => { tm.sidebarMode = mode; },
    workspaceContainer: tm.workspaceContainer,
    renderTabBar: () => tm.renderTabBar(),
    renderActivityBar: () => tm.renderActivityBar(),
    renderWorkspace: (tab) => tm.renderWorkspace(tab),
    detachSidebarView: (mode) => detachSidebarView({
      getActiveTab: () => tm._activeTab(),
      capturePanelWidths,
      viewStore: buildViewStore(tm),
    }, mode),
  };
}

export function disposeSideView(tm, mode) {
  doDisposeSideView(buildViewStore(tm), mode);
}

export function disposeAllSideViews(tm) {
  doDisposeAllSideViews(buildViewStore(tm));
}

export function disposeAllTabs(tm) {
  doDisposeAllTabs({ tabs: tm.tabs, setActiveTabId: (id) => { tm.activeTabId = id; } });
}
