/**
 * Tab bar rendering — extracted from tab-manager.js to reduce component size.
 *
 * Builds the tab bar UI: color filters, tab elements, and the add-tab button.
 *
 * @typedef {Object} RenderTabBarDeps
 * @property {HTMLElement} tabBar
 * @property {Map<string, import('./tab-manager-helpers.js').WorkspaceTab>} tabs
 * @property {string|null} activeTabId
 * @property {string|null} activeColorFilter
 * @property {Set<string>} excludedColors
 * @property {(id: string) => void} switchTo
 * @property {(id: string) => void} closeTab
 * @property {(id: string, nameEl: HTMLElement) => void} renameTab
 * @property {(id: string, colorGroupId: string|null) => void} setTabColorGroup
 * @property {(id: string) => void} toggleNoShortcut
 * @property {(colorGroupId: string) => void} setColorFilter
 * @property {(colorGroupId: string) => void} toggleExcludeColor
 * @property {() => void} createTab
 * @property {(fromId: string, toId: string, before: boolean) => void} reorderTab
 * @property {(tab: import('./tab-manager-helpers.js').WorkspaceTab) => boolean} isTabVisible
 * @property {() => void} renderTabBar     - for callbacks that re-render
 * @property {() => void} clearColorFilters
 */

import { _el } from './dom.js';
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
  deps.tabBar.replaceChildren();

  const filters = buildColorFilters(deps.tabs, deps.activeColorFilter, deps.excludedColors, {
    onClearFilter: () => { deps.clearColorFilters(); deps.renderTabBar(); },
    onSetFilter: (id) => deps.setColorFilter(id),
    onToggleExclude: (id) => deps.toggleExcludeColor(id),
  });
  if (filters) deps.tabBar.appendChild(filters);

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

  for (const [id, tab] of deps.tabs) {
    if (!deps.isTabVisible(tab)) continue;
    const tabEl = buildTabElement(tabElementDeps, id, tab);
    deps.tabBar.appendChild(tabEl);
    tabElements.set(id, tabEl);
  }

  const addBtn = _el('div', 'tab tab-add', '+');
  addBtn.addEventListener('click', () => deps.createTab());
  deps.tabBar.appendChild(addBtn);

  return tabElements;
}
