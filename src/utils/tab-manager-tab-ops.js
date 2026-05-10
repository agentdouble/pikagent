/**
 * TabManager tab operations helpers — extracted from TabManager class.
 *
 * `bindTabOps(tabManager)` assembles the shared dependency objects once so
 * that renderTabBar, createTab, and closeTab do not each repeat the same
 * property lookups against the TabManager instance.
 */

import {
  renderTabBar as doRenderTabBar,
  createTab as doCreateTab,
  closeTab as doCloseTab,
  reorderEntries,
  inlineRenameTab as doInlineRenameTab,
} from './tab-facade.js';

/**
 * Build the shared deps object from a TabManager instance.
 * Call once per "operation batch" (e.g. at the top of each public method)
 * rather than repeating `tm.x` lookups in every helper.
 *
 * @param {object} tm - TabManager instance
 */
function _sharedDeps(tm) {
  return {
    tabs: tm.tabs,
    activeTabId: tm.activeTabId,
    activeColorFilter: tm.activeColorFilter,
    excludedColors: tm.excludedColors,
    defaultCwd: tm.defaultCwd,
    configManager: tm.configManager,
    renderTabBar: () => tm.renderTabBar(),
  };
}

/**
 * Return a bound operations object so callers no longer need to pass `tm`
 * to every individual helper.
 *
 * @param {object} tm - TabManager instance
 * @returns {{ renderTabBar, createTab, closeTab, reorderTab, renameTab }}
 */
export function bindTabOps(tm) {
  return {
    renderTabBar: () => renderTabBar(tm),
    createTab: (switchTo, name, cwd) => createTab(tm, switchTo, name, cwd),
    closeTab: (createTabFn, switchToFn, id) => closeTab(tm, createTabFn, switchToFn, id),
    reorderTab: (fromId, toId, before) => reorderTab(tm, fromId, toId, before),
    renameTab: (id) => renameTab(tm, id),
  };
}

/**
 * Build the deps and call doRenderTabBar.
 * @param {object} tm - TabManager instance
 * @returns {Map} tab element map
 */
export function renderTabBar(tm) {
  const shared = _sharedDeps(tm);
  return doRenderTabBar({
    tabBar: tm.tabBar,
    tabs: shared.tabs,
    activeTabId: shared.activeTabId,
    activeColorFilter: shared.activeColorFilter,
    excludedColors: shared.excludedColors,
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
    renderTabBar: shared.renderTabBar,
  });
}

/**
 * Build the deps and call doCreateTab.
 */
export function createTab(tm, switchTo, name, cwd) {
  const shared = _sharedDeps(tm);
  return doCreateTab({
    tabs: shared.tabs,
    defaultCwd: shared.defaultCwd,
    activeColorFilter: shared.activeColorFilter,
    renderTabBar: shared.renderTabBar,
    configManager: shared.configManager,
  }, switchTo, name, cwd);
}

/**
 * Build the deps and call doCloseTab.
 */
export function closeTab(tm, createTabFn, switchToFn, id) {
  const shared = _sharedDeps(tm);
  return doCloseTab({
    tabs: shared.tabs,
    activeTabId: shared.activeTabId,
    renderTabBar: shared.renderTabBar,
    configManager: shared.configManager,
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
