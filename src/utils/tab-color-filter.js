/**
 * Color filter logic for tab manager.
 * Extracted from tab-manager.js to reduce component size.
 */
import { _el } from './dom.js';
import { COLOR_GROUPS } from './tab-manager-helpers.js';
import { attachContextMenu } from './context-menu.js';

/**
 * Check if a tab is visible given the current filter state.
 */
export function isTabVisible(tab, activeColorFilter, excludedColors) {
  if (activeColorFilter && tab.colorGroup !== activeColorFilter) return false;
  if (excludedColors.has(tab.colorGroup)) return false;
  return true;
}

/**
 * Build the color filter bar DOM element.
 * @param {Map<string, import('./tab-manager-helpers.js').WorkspaceTab>} tabs
 * @param {string|null} activeColorFilter
 * @param {Set<string>} excludedColors
 * @param {{ onClearFilter: () => void, onSetFilter: (colorGroupId: string) => void, onToggleExclude: (colorGroupId: string) => void }} handlers
 * @returns {HTMLElement|null}
 */
/**
 * Apply "include only this color" filter and ensure a visible tab is active.
 * @param {{ activeColorFilter: string|null, excludedColors: Set<string> }} state
 * @param {string} colorGroupId
 * @param {() => void} renderTabBar
 * @param {() => void} ensureVisibleTabActive
 */
export function setColorFilter(state, colorGroupId, renderTabBar, ensureVisibleTabActive) {
  state.excludedColors.clear();
  state.activeColorFilter = state.activeColorFilter === colorGroupId ? null : colorGroupId;
  renderTabBar();
  ensureVisibleTabActive();
}

/**
 * Toggle exclusion of a color group and ensure a visible tab is active.
 * @param {{ activeColorFilter: string|null, excludedColors: Set<string> }} state
 * @param {string} colorGroupId
 * @param {() => void} renderTabBar
 * @param {() => void} ensureVisibleTabActive
 */
export function toggleExcludeColor(state, colorGroupId, renderTabBar, ensureVisibleTabActive) {
  state.activeColorFilter = null;
  if (state.excludedColors.has(colorGroupId)) state.excludedColors.delete(colorGroupId);
  else state.excludedColors.add(colorGroupId);
  renderTabBar();
  ensureVisibleTabActive();
}

/**
 * If the active tab is not visible under the current filter, switch to
 * the first visible tab.
 * @param {Map<string, import('./tab-manager-helpers.js').WorkspaceTab>} tabs
 * @param {() => import('./tab-manager-helpers.js').WorkspaceTab|undefined} getActiveTab
 * @param {string|null} activeColorFilter
 * @param {Set<string>} excludedColors
 * @param {(id: string) => void} switchTo
 */
export function ensureVisibleTabActive(tabs, getActiveTab, activeColorFilter, excludedColors, switchTo) {
  const active = getActiveTab();
  if (active && isTabVisible(active, activeColorFilter, excludedColors)) return;
  for (const [id, tab] of tabs) {
    if (isTabVisible(tab, activeColorFilter, excludedColors)) { switchTo(id); return; }
  }
}

/**
 * Build the color filter bar DOM element.
 * @param {Map<string, import('./tab-manager-helpers.js').WorkspaceTab>} tabs
 * @param {string|null} activeColorFilter
 * @param {Set<string>} excludedColors
 * @param {{ onClearFilter: () => void, onSetFilter: (colorGroupId: string) => void, onToggleExclude: (colorGroupId: string) => void }} handlers
 * @returns {HTMLElement|null}
 */
export function buildColorFilters(tabs, activeColorFilter, excludedColors, handlers) {
  const usedColors = new Set();
  for (const [, tab] of tabs) {
    if (tab.colorGroup) usedColors.add(tab.colorGroup);
  }
  if (usedColors.size === 0) return null;

  const filterWrap = _el('div', 'tab-color-filters');

  const noFilter = activeColorFilter === null && excludedColors.size === 0;
  const allBtn = _el('span', `tab-filter-dot tab-filter-all${noFilter ? ' active' : ''}`);
  allBtn.textContent = '\u2217';
  allBtn.addEventListener('click', handlers.onClearFilter);
  filterWrap.appendChild(allBtn);

  for (const cg of COLOR_GROUPS) {
    if (!usedColors.has(cg.id)) continue;
    const isIncluded = activeColorFilter === cg.id;
    const isExcluded = excludedColors.has(cg.id);
    const cls = `tab-filter-dot${isIncluded ? ' active' : ''}${isExcluded ? ' excluded' : ''}`;
    const dot = _el('span', cls);
    dot.style.background = cg.color;
    dot.title = `${cg.label}${isExcluded ? ' (excluded)' : ''}`;
    dot.addEventListener('click', () => handlers.onSetFilter(cg.id));
    attachContextMenu(dot, () => { handlers.onToggleExclude(cg.id); });
    filterWrap.appendChild(dot);
  }

  return filterWrap;
}
