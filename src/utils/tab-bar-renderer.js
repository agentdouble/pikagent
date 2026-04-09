/**
 * Tab bar rendering — extracted from tab-manager.js to reduce component size.
 *
 * Builds the tab bar UI: color filters, tab elements, and the add-tab button.
 *
 * @typedef {Object} RenderTabBarDeps
 * @property {HTMLElement} tabBar
 * @property {Map<string, Object>} tabs
 * @property {string|null} activeTabId
 * @property {string|null} activeColorFilter
 * @property {Set<string>} excludedColors
 * @property {Function} switchTo         - (id) => void
 * @property {Function} closeTab         - (id) => void
 * @property {Function} renameTab        - (id, nameEl) => void
 * @property {Function} setTabColorGroup - (id, colorGroupId) => void
 * @property {Function} toggleNoShortcut - (id) => void
 * @property {Function} setColorFilter   - (colorGroupId) => void
 * @property {Function} toggleExcludeColor - (colorGroupId) => void
 * @property {Function} createTab        - () => void
 * @property {Function} reorderTab       - (fromId, toId, before) => void
 * @property {Function} isTabVisible     - (tab) => boolean
 * @property {Function} renderTabBar     - () => void   — for callbacks that re-render
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
