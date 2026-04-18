/**
 * Tab Facade — re-exports tab utilities used by tab-manager.js.
 *
 * This module exists solely to reduce the number of direct imports in
 * tab-manager.js (issue #130).  It contains NO logic of its own.
 *
 * Other consumers should continue importing from the original modules.
 */

export { inlineRenameTab } from './tab-renderer.js';
export { renderTabBar } from './tab-bar-renderer.js';
export { isTabVisible } from './tab-color-filter.js';
export { createTab, closeTab, switchTo } from './tab-lifecycle.js';
export {
  reorderEntries, findCycleTarget, findColorGroupTarget,
} from './tab-manager-helpers.js';
