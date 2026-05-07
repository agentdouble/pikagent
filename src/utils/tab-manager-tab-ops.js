/**
 * TabManager tab operations helpers — extracted from TabManager class.
 *
 * Builds the deps objects for renderTabBar, createTab, closeTab, and
 * color-filter operations.
 */

import {
  renderTabBar as doRenderTabBar,
  createTab as doCreateTab,
  closeTab as doCloseTab,
  reorderEntries,
  inlineRenameTab as doInlineRenameTab,
} from './tab-facade.js';

/**
 * Build the deps and call doRenderTabBar.
 * @param {object} tm - TabManager instance
 * @returns {Map} tab element map
 */
export function renderTabBar(tm) {
  return doRenderTabBar({
    tabBar: tm.tabBar,
    tabs: tm.tabs,
    activeTabId: tm.activeTabId,
    activeColorFilter: tm.activeColorFilter,
    excludedColors: tm.excludedColors,
    switchTo: (id) => tm.switchTo(id),
    closeTab: (id) => tm.closeTab(id),
    renameTab: (id, nameEl) => tm.renameTab(id, nameEl),
    setTabColorGroup: (id, cg) => tm.setTabColorGroup(id, cg),
    toggleNoShortcut: (id) => tm.toggleNoShortcut(id),
    setColorFilter: (id) => tm.setColorFilter(id),
    toggleExcludeColor: (id) => tm.toggleExcludeColor(id),
    clearColorFilters: () => { tm.activeColorFilter = null; tm.excludedColors.clear(); },
    createTab: () => tm.createTab(),
    reorderTab: (fromId, toId, before) => tm.reorderTab(fromId, toId, before),
    isTabVisible: (tab) => tm._isTabVisible(tab),
    renderTabBar: () => tm.renderTabBar(),
  });
}

/**
 * Build the deps and call doCreateTab.
 */
export function createTab(tm, switchTo, name, cwd) {
  return doCreateTab({
    tabs: tm.tabs,
    defaultCwd: tm.defaultCwd,
    activeColorFilter: tm.activeColorFilter,
    renderTabBar: () => tm.renderTabBar(),
    configManager: tm.configManager,
  }, switchTo, name, cwd);
}

/**
 * Build the deps and call doCloseTab.
 */
export function closeTab(tm, createTabFn, switchToFn, id) {
  return doCloseTab({
    tabs: tm.tabs,
    activeTabId: tm.activeTabId,
    renderTabBar: () => tm.renderTabBar(),
    configManager: tm.configManager,
  }, createTabFn, switchToFn, id);
}

/**
 * Reorder tabs in the map.
 */
export function reorderTab(tm, fromId, toId, before) {
  if (fromId === toId) return;
  tm.tabs = new Map(reorderEntries(Array.from(tm.tabs.entries()), fromId, toId, before));
  tm.renderTabBar();
  tm.configManager.scheduleAutoSave();
}

/**
 * Inline rename a tab.
 */
export function renameTab(tm, id) {
  const tab = tm.tabs.get(id);
  return (nameEl) => doInlineRenameTab(tab, nameEl,
    () => { tm.renderTabBar(); tm.configManager.scheduleAutoSave(); },
    () => tm.renderTabBar(),
  );
}
