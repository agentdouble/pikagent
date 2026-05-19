/**
 * Barrel re-export for the tab-manager utility family.
 *
 * These modules were extracted from TabManager to reduce component size.
 * TabManager is the primary consumer — this barrel keeps its import block compact.
 */

export { initTabManager, setupBusListeners, getComponent } from './tab-manager-init.js';
export {
  renderActivityBar, setSidebarMode, renderWorkspace,
  buildSwitchToDeps, disposeSideView, disposeAllSideViews, disposeAllTabs,
} from './tab-manager-sidebar.js';
export { bindTabOps, reorderTab, renameTab } from './tab-manager-tab-ops.js';
export {
  nextTab, prevTab, goToColorGroup, focusDirection,
  setTabColorGroup, toggleNoShortcut,
} from './tab-navigation.js';
