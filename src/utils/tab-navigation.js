/**
 * Tab navigation & property helpers — extracted from tab-manager.js.
 *
 * Contains keyboard-driven tab switching, color group navigation,
 * split/focus actions, and tab property mutations (colorGroup, noShortcut).
 */

import { findCycleTarget, findColorGroupTarget } from './tab-manager-helpers.js';

/**
 * Switch to the next tab in the cycle.
 * @param {Map<string, import('./tab-types.js').WorkspaceTab>} tabs
 * @param {string|null} activeTabId
 * @param {(id: string) => void} switchTo
 */
export function nextTab(tabs, activeTabId, switchTo) {
  const target = findCycleTarget(tabs, activeTabId, 1);
  if (target) switchTo(target);
}

/**
 * Switch to the previous tab in the cycle.
 * @param {Map<string, import('./tab-types.js').WorkspaceTab>} tabs
 * @param {string|null} activeTabId
 * @param {(id: string) => void} switchTo
 */
export function prevTab(tabs, activeTabId, switchTo) {
  const target = findCycleTarget(tabs, activeTabId, -1);
  if (target) switchTo(target);
}

/**
 * Navigate to the next tab in a given color group (round-robin).
 * @param {Map<string, import('./tab-types.js').WorkspaceTab>} tabs
 * @param {string|null} activeTabId
 * @param {string} colorGroupId
 * @param {(id: string) => void} switchTo
 */
export function goToColorGroup(tabs, activeTabId, colorGroupId, switchTo) {
  const target = findColorGroupTarget(tabs, activeTabId, colorGroupId);
  if (target) switchTo(target);
}

/**
 * Move focus in a direction — delegates to board view or terminal panel.
 * @param {string} direction
 * @param {string} sidebarMode
 * @param {object|null} boardView
 * @param {() => import('./tab-types.js').WorkspaceTab|undefined} getActiveTab
 */
export function focusDirection(direction, sidebarMode, boardView, getActiveTab) {
  if (sidebarMode === 'board' && boardView) {
    boardView.focusDirection(direction);
    return;
  }
  getActiveTab()?.terminalPanel?.focusDirection(direction);
}

/**
 * Set or clear a tab's color group.
 * @param {Map<string, import('./tab-types.js').WorkspaceTab>} tabs
 * @param {string} id
 * @param {string|null} colorGroupId
 * @param {() => void} renderTabBar
 * @param {{ scheduleAutoSave: () => void }} configManager
 */
export function setTabColorGroup(tabs, id, colorGroupId, renderTabBar, configManager) {
  const tab = tabs.get(id);
  if (!tab) return;
  tab.colorGroup = colorGroupId;
  renderTabBar();
  configManager.scheduleAutoSave();
}

/**
 * Toggle the noShortcut flag on a tab.
 * @param {Map<string, import('./tab-types.js').WorkspaceTab>} tabs
 * @param {string} id
 * @param {() => void} renderTabBar
 * @param {{ scheduleAutoSave: () => void }} configManager
 */
export function toggleNoShortcut(tabs, id, renderTabBar, configManager) {
  const tab = tabs.get(id);
  if (!tab) return;
  tab.noShortcut = !tab.noShortcut;
  renderTabBar();
  configManager.scheduleAutoSave();
}
