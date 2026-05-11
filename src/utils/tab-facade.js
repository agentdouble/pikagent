/**
 * Tab Facade — re-exports tab utilities and service APIs used by tab-manager.js.
 *
 * This module exists to reduce the number of direct imports in
 * tab-manager.js (issues #130, #416).  It contains NO logic of its own.
 *
 * Other consumers should continue importing from the original modules.
 */

export { inlineRenameTab } from './tab-renderer.js';
export { renderTabBar } from './tab-bar-renderer.js';
export {
  isTabVisible, setColorFilter, toggleExcludeColor, ensureVisibleTabActive,
} from './tab-color-filter.js';
export { createTab, closeTab, switchTo } from './tab-lifecycle.js';
export {
  reorderEntries,
} from './tab-manager-helpers.js';
export {
  nextTab, prevTab, goToColorGroup, focusDirection,
  setTabColorGroup, toggleNoShortcut,
} from './tab-navigation.js';
export { buildPrApi, buildWorktreeApi, buildViewStore } from './tab-manager-api.js';

// ── domain service facade (git, fs, config APIs) ─────────────────────
import gitApi from '../services/git-api.js';
import fsApi from '../services/fs-api.js';
import configApi from '../services/config-api.js';

export const tabFacade = {
  // git
  gitBranch:    (...a) => gitApi.branch(...a),
  // fs
  homedir:      (...a) => fsApi.homedir(...a),
  // config
  getDefault:   (...a) => configApi.getDefault(...a),
  loadDefault:  (...a) => configApi.loadDefault(...a),
};
