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
 * Bind the tab-ops trio to a TabManager instance.
 *
 * Centralizes the shared callback wiring (switchTo, renderTabBar,
 * configManager bridges) so each op no longer duplicates the boilerplate.
 *
 * Primitive deps that may be reassigned on `tm` between calls
 * (activeTabId, activeColorFilter, defaultCwd, tabs Map) are still read
 * fresh at op-invocation time — deps objects are built per-call. Only
 * the bound closures over `tm` are shared. This preserves the exact
 * pre-refactor semantics where `renderTabBar(tm)` re-reads tm state.
 *
 * Public standalone exports (`renderTabBar`, `createTab`, `closeTab`)
 * delegate here so existing call sites keep working unchanged.
 *
 * @param {object} tm - TabManager instance
 */
export function bindTabOps(tm) {
  // Stable closures over `tm`, captured once.
  const renderTabBar = () => tm.renderTabBar();
  const switchTo = (id) => tm.switchTo(id);
  const closeTabBridge = (id) => tm.closeTab(id);
  const renameTabBridge = (id, nameEl) => tm.renameTab(id, nameEl);

  return {
    renderTabBar: () => doRenderTabBar({
      tabBar: tm.tabBar,
      tabs: tm.tabs,
      activeTabId: tm.activeTabId,
      activeColorFilter: tm.activeColorFilter,
      excludedColors: tm.excludedColors,
      switchTo,
      closeTab: closeTabBridge,
      renameTab: renameTabBridge,
      setTabColorGroup: (id, cg) => tm.setTabColorGroup(id, cg),
      toggleNoShortcut: (id) => tm.toggleNoShortcut(id),
      setColorFilter: (id) => tm.setColorFilter(id),
      toggleExcludeColor: (id) => tm.toggleExcludeColor(id),
      clearColorFilters: () => { tm.activeColorFilter = null; tm.excludedColors.clear(); },
      createTab: () => tm.createTab(),
      reorderTab: (fromId, toId, before) => tm.reorderTab(fromId, toId, before),
      isTabVisible: (tab) => tm._isTabVisible(tab),
      renderTabBar,
    }),
    createTab: (switchToFn, name, cwd) => doCreateTab({
      tabs: tm.tabs,
      defaultCwd: tm.defaultCwd,
      activeColorFilter: tm.activeColorFilter,
      renderTabBar,
      configManager: tm.configManager,
    }, switchToFn, name, cwd),
    closeTab: (createTabFn, switchToFn, id) => doCloseTab({
      tabs: tm.tabs,
      activeTabId: tm.activeTabId,
      renderTabBar,
      configManager: tm.configManager,
    }, createTabFn, switchToFn, id),
  };
}

// Cache the bound trio per TabManager instance: each `tm` keeps its own
// closures over `switchTo`, `closeTab`, `renameTab`, so they are reused
// across calls instead of being rebuilt on every wrapper invocation.
const opsCache = new WeakMap();

function ops(tm) {
  let bound = opsCache.get(tm);
  if (!bound) {
    bound = bindTabOps(tm);
    opsCache.set(tm, bound);
  }
  return bound;
}

/**
 * Build the deps and call doRenderTabBar.
 * @param {object} tm - TabManager instance
 * @returns {Map} tab element map
 */
export function renderTabBar(tm) {
  return ops(tm).renderTabBar();
}

/**
 * Build the deps and call doCreateTab.
 */
export function createTab(tm, switchTo, name, cwd) {
  return ops(tm).createTab(switchTo, name, cwd);
}

/**
 * Build the deps and call doCloseTab.
 */
export function closeTab(tm, createTabFn, switchToFn, id) {
  return ops(tm).closeTab(createTabFn, switchToFn, id);
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
