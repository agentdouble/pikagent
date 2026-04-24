/**
 * Workspace Serializer — extracted from workspace-layout.js.
 *
 * Handles tab serialization and config restoration.
 *
 * @typedef {{ name: string, cwd: string, noShortcut: boolean, colorGroup: string|null, splitTree: Record<string, unknown>|null, panels: Record<string, number>, webviewTabs?: Array<{ url: string, title?: string }> }} SerializedTab
 *
 * @typedef {{ tabs: Map<string, WorkspaceTab>, activeTabId: string|null }} SerializeDeps
 *
 * @typedef {{ tabs: Map<string, WorkspaceTab>, setActiveTabId: (id: string|null) => void, defaultCwd: string, renderTabBar: () => void, switchTo: (id: string) => void, configManager: { isRestoring: boolean }, viewStore: import('./sidebar-manager.js').SideViewStore }} RestoreConfigDeps
 */

import { generateId } from './id.js';
import { WorkspaceTab } from './tab-types.js';
import { disposeAllSideViews } from './sidebar-manager.js';
import { capturePanelWidths } from './workspace-resize.js';
import { disposeAllTabs } from './workspace-cleanup.js';
import { extractFolderName } from './file-tree-helpers.js';

/**
 * Walk a split tree depth-first and return the cwd of the first terminal node.
 * @param {{ type: string, cwd?: string, children?: Array<unknown> }|null|undefined} tree
 * @returns {string|null}
 */
function firstTerminalCwd(tree) {
  if (!tree) return null;
  if (tree.type === 'terminal') return tree.cwd || null;
  if (Array.isArray(tree.children)) {
    for (const child of tree.children) {
      const cwd = firstTerminalCwd(child);
      if (cwd) return cwd;
    }
  }
  return null;
}

// ── Serialization ──

/**
 * Serialize all tabs into a config object.
 * @param {SerializeDeps} deps
 * @returns {{ tabs: Array<SerializedTab>, activeTabIndex: number }}
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
      userNamed: tab.userNamed || false,
      noShortcut: tab.noShortcut || false,
      colorGroup: tab.colorGroup || null,
      worktree: tab.worktree || null,
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
 * @param {{ tabs: Array<Partial<SerializedTab> & { name: string }>, activeTabIndex?: number }} config
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
    const firstCwd = firstTerminalCwd(tabData.splitTree);
    const resolvedCwd = firstCwd || tabData.cwd || defaultCwd || '/';
    const derived = extractFolderName(resolvedCwd);
    const folderName = derived && derived !== '/' ? derived : null;
    // Legacy configs predate `userNamed`. Infer it: a literal `Workspace N`
    // name is the old default and is considered auto; anything else is
    // treated as a name the user explicitly chose and must be preserved.
    const userNamed = typeof tabData.userNamed === 'boolean'
      ? tabData.userNamed
      : !/^Workspace \d+$/.test(tabData.name || '');
    const name = userNamed
      ? tabData.name
      : folderName || tabData.name;
    const tab = new WorkspaceTab(id, name, resolvedCwd);
    tab.userNamed = userNamed;
    tab.noShortcut = tabData.noShortcut || false;
    tab.colorGroup = tabData.colorGroup || null;
    tab.worktree = tabData.worktree || null;
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
