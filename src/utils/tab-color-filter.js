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
 * @param {Map} tabs
 * @param {string|null} activeColorFilter
 * @param {Set} excludedColors
 * @param {Object} handlers - { onClearFilter, onSetFilter, onToggleExclude }
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
