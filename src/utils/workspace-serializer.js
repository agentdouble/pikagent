/**
 * Workspace Serializer — extracted from workspace-layout.js.
 *
 * Handles tab serialization and config restoration.
 *
 * @typedef {{ tabs: Map<string, WorkspaceTab>, activeTabId: string|null }} SerializeDeps
 *
 * @typedef {{ tabs: Map<string, WorkspaceTab>, setActiveTabId: (id: string|null) => void, defaultCwd: string, renderTabBar: () => void, switchTo: (id: string) => void, configManager: { isRestoring: boolean }, viewStore: import('./sidebar-manager.js').SideViewStore }} RestoreConfigDeps
 */

import { generateId } from './id.js';
import { WorkspaceTab } from './tab-manager-helpers.js';
import { disposeAllSideViews } from './sidebar-manager.js';
import { capturePanelWidths } from './workspace-resize.js';
import { disposeAllTabs } from './workspace-cleanup.js';

// ── Serialization ──

/**
 * Serialize all tabs into a config object.
 * @param {SerializeDeps} deps
 * @returns {{ tabs: Array<{ name: string, cwd: string, noShortcut: boolean, colorGroup: string|null, splitTree: unknown, panels: Record<string, unknown>, webviewTabs?: unknown }>, activeTabIndex: number }}
 */
export function serialize({ tabs, activeTabId }) {
  const serializedTabs = [];
  let activeTabIndex = 0;
  let i = 0;

  for (const [id, tab] of tabs) {
    if (id === activeTabId) activeTabIndex = i;

    const tabData = {
      name: tab.name,
      cwd: tab.cwd,
      noShortcut: tab.noShortcut || false,
      colorGroup: tab.colorGroup || null,
      splitTree: null,
      panels: {},
    };

    // Serialize terminal tree (works for both active and detached layouts)
    if (tab.terminalPanel) {
      tabData.splitTree = tab.terminalPanel.serialize();
    }

    // Serialize webview tabs
    if (tab.fileViewer) {
      tabData.webviewTabs = tab.fileViewer.getWebviewTabs();
    }

    // Panel widths — active tab: snapshot from live DOM; inactive: use cached
    if (id === activeTabId) capturePanelWidths(tab);
    if (tab._panelWidths) tabData.panels = { ...tab._panelWidths };

    serializedTabs.push(tabData);
    i++;
  }

  return { tabs: serializedTabs, activeTabIndex };
}

// ── Restore ──

/**
 * Restore workspace from a saved config.
 * @param {RestoreConfigDeps} deps
 * @param {{ tabs: Array<{ name: string, cwd?: string, noShortcut?: boolean, colorGroup?: string|null, splitTree?: unknown, panels?: Record<string, unknown>, webviewTabs?: unknown }>, activeTabIndex?: number }} config
 */
export async function restoreConfig({ tabs, setActiveTabId, defaultCwd, renderTabBar, switchTo, configManager, viewStore }, config) {
  if (!config || !config.tabs || config.tabs.length === 0) return;

  configManager.isRestoring = true;

  // Reset side views (old terminal IDs will be invalid)
  disposeAllSideViews(viewStore);
  disposeAllTabs({ tabs, setActiveTabId });

  // Create tabs from config
  for (const tabData of config.tabs) {
    const id = generateId('tab');
    const tab = new WorkspaceTab(id, tabData.name, tabData.cwd || defaultCwd || '/');
    tab.noShortcut = tabData.noShortcut || false;
    tab.colorGroup = tabData.colorGroup || null;
    tab._restoreData = tabData;
    tabs.set(id, tab);
  }

  renderTabBar();

  // Switch to the active tab
  const tabIds = Array.from(tabs.keys());
  const activeIdx = Math.min(config.activeTabIndex || 0, tabIds.length - 1);
  switchTo(tabIds[activeIdx]);

  configManager.isRestoring = false;
}
