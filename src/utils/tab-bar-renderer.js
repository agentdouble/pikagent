/**
 * Tab bar rendering — extracted from tab-manager.js to reduce component size.
 *
 * Builds the tab bar UI: color filters, tab elements, and the add-tab button.
 *
 * @typedef {{ tabBar: HTMLElement, tabs: Map<string, import('./tab-types.js').WorkspaceTab>, activeTabId: string|null, activeColorFilter: string|null, excludedColors: Set<string>, switchTo: (id: string) => void, closeTab: (id: string) => void, renameTab: (id: string, nameEl: HTMLElement) => void, setTabColorGroup: (id: string, colorGroupId: string|null) => void, toggleNoShortcut: (id: string) => void, setColorFilter: (colorGroupId: string) => void, toggleExcludeColor: (colorGroupId: string) => void, createTab: () => void, reorderTab: (fromId: string, toId: string, before: boolean) => void, isTabVisible: (tab: import('./tab-types.js').WorkspaceTab) => boolean, renderTabBar: () => void, clearColorFilters: () => void }} RenderTabBarDeps
 */

import { _el, renderList } from './tab-dom.js';
import { buildColorFilters } from './tab-color-filter.js';
import { buildTabElement } from './tab-renderer.js';

/**
 * Render the full tab bar: color filters, tab elements, and add button.
 * Returns the Map of tab id → tab DOM element.
 *
 * @param {RenderTabBarDeps} deps
 * @returns {Map<string, HTMLElement>}
 */
export function renderTabBar(deps) {
  const filters = buildColorFilters(deps.tabs, deps.activeColorFilter, deps.excludedColors, {
    onClearFilter: () => { deps.clearColorFilters(); deps.renderTabBar(); },
    onSetFilter: (id) => deps.setColorFilter(id),
    onToggleExclude: (id) => deps.toggleExcludeColor(id),
  });

  const tabElements = new Map();

  /** @type {import('./tab-renderer.js').TabElementDeps} */
  const tabElementDeps = {
    activeTabId: deps.activeTabId,
    tabs: deps.tabs,
    switchTo: (id) => deps.switchTo(id),
    closeTab: (id) => deps.closeTab(id),
    renameTab: (id, nameEl) => deps.renameTab(id, nameEl),
    setTabColorGroup: (id, cg) => deps.setTabColorGroup(id, cg),
    toggleNoShortcut: (id) => deps.toggleNoShortcut(id),
    dragDeps: {
      getTabElements: () => tabElements,
      reorderTab: (fromId, toId, before) => deps.reorderTab(fromId, toId, before),
    },
  };

  const visibleTabs = [...deps.tabs].filter(([, tab]) => deps.isTabVisible(tab));

  const addBtn = _el('div', 'tab tab-add', '+');
  addBtn.addEventListener('click', () => deps.createTab());

  const allItems = [
    filters,
    ...visibleTabs.map(([id, tab]) => {
      const tabEl = buildTabElement(tabElementDeps, id, tab);
      tabElements.set(id, tabEl);
      return tabEl;
    }),
    addBtn,
  ];
  renderList(deps.tabBar, allItems, (item) => item);

  return tabElements;
}
