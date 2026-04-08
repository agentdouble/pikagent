/**
 * Tab Lifecycle — extracted from tab-manager.js.
 *
 * Handles tab creation, removal, and activation (switchTo) logic.
 *
 * Functions that mutate state receive a narrow dependency object instead of
 * the full TabManager — see typedefs below.
 * Pure lookup functions (findTabForTerminal, onTerminalCwdChanged) accept
 * only the data they need.
 *
 * @typedef {Object} CreateTabDeps
 * @property {Map<string, WorkspaceTab>} tabs
 * @property {string} defaultCwd
 * @property {string|null} activeColorFilter
 * @property {Function} renderTabBar
 * @property {{ scheduleAutoSave: Function }} configManager
 *
 * @typedef {Object} CloseTabDeps
 * @property {Map<string, WorkspaceTab>} tabs
 * @property {string|null} activeTabId
 * @property {Function} renderTabBar
 * @property {{ scheduleAutoSave: Function }} configManager
 *
 * @typedef {Object} SwitchToDeps
 * @property {Map<string, WorkspaceTab>} tabs
 * @property {Function} getActiveTabId         - () => string|null
 * @property {Function} setActiveTabId         - (id) => void
 * @property {Function} getSidebarMode         - () => string
 * @property {Function} setSidebarMode         - (mode) => void
 * @property {HTMLElement} workspaceContainer
 * @property {Function} renderTabBar
 * @property {Function} renderActivityBar
 * @property {Function} renderWorkspace
 * @property {Function} detachSidebarView      - (mode) => void
 */

import { generateId } from './id.js';
import { showConfirmDialog, _el } from './dom.js';
import { bus } from './events.js';
import { WorkspaceTab } from './tab-manager-helpers.js';
import {
  reattachLayout, syncFileTree, capturePanelWidths, disposeTab,
} from './workspace-layout.js';

// ── Tab creation ──

/**
 * Create a new tab and switch to it.
 * @param {CreateTabDeps} deps
 * @param {Function} switchToFn  - Function to switch to a tab by id
 * @param {string|null} name     - Optional tab name
 * @param {string|null} cwd      - Optional working directory
 * @returns {WorkspaceTab}
 */
export function createTab(deps, switchToFn, name = null, cwd = null) {
  const id = generateId('tab');
  const tabName = name || `Workspace ${deps.tabs.size + 1}`;
  const tab = new WorkspaceTab(id, tabName, cwd || deps.defaultCwd || '/');
  if (deps.activeColorFilter) tab.colorGroup = deps.activeColorFilter;
  deps.tabs.set(id, tab);
  deps.renderTabBar();
  switchToFn(id);
  deps.configManager.scheduleAutoSave();
  return tab;
}

// ── Tab removal ──

/**
 * Close a tab by id, prompting the user for confirmation.
 * @param {CloseTabDeps} deps
 * @param {Function} createTabFn  - Function to create a new tab (when closing last)
 * @param {Function} switchToFn   - Function to switch to a tab by id
 * @param {string} id             - Tab id to close
 */
export async function closeTab(deps, createTabFn, switchToFn, id) {
  const tab = deps.tabs.get(id);
  if (!tab) return;

  const ok = await showConfirmDialog(
    _el('p', null, 'Close workspace ', _el('strong', null, tab.name), '?'),
    { confirmLabel: 'Close' },
  );
  if (!ok) return;

  disposeTab(tab);
  deps.tabs.delete(id);

  if (deps.tabs.size === 0) {
    createTabFn();
    return;
  }

  if (deps.activeTabId === id) {
    const remaining = Array.from(deps.tabs.values());
    switchToFn(remaining[0].id);
  }

  deps.renderTabBar();
  deps.configManager.scheduleAutoSave();
}

// ── Tab activation ──

/**
 * Activate a tab by id, handling sidebar mode transitions and DOM attachment.
 * @param {SwitchToDeps} deps
 * @param {string} id  - Tab id to activate
 */
export function switchTo(deps, id) {
  const tab = deps.tabs.get(id);
  if (!tab) return;

  const activeTabId = deps.getActiveTabId();

  // If in a non-work mode, switch back to work mode
  if (deps.getSidebarMode() !== 'work') {
    deps.detachSidebarView(deps.getSidebarMode());
    deps.setSidebarMode('work');
    deps.renderActivityBar();

    // If this tab is already active, just re-show its layout
    if (id === activeTabId) {
      if (tab.layoutElement) {
        reattachLayout({ workspaceContainer: deps.workspaceContainer }, tab);
        syncFileTree(tab);
        /** @fires workspace:activated {undefined} — tab re-shown */
        bus.emit('workspace:activated');
      }
      deps.renderTabBar();
      return;
    }
  }

  if (id === activeTabId) return;

  // Detach outgoing tab (keep terminals alive!)
  if (activeTabId) {
    const prev = deps.tabs.get(activeTabId);
    if (prev && prev.layoutElement) {
      // Capture panel widths before detaching (needs attached DOM)
      capturePanelWidths(prev);
      prev.layoutElement.remove();
    }
  }

  deps.setActiveTabId(id);
  deps.renderTabBar();

  if (tab.layoutElement) {
    reattachLayout({ workspaceContainer: deps.workspaceContainer }, tab);
    syncFileTree(tab);
    /** @fires workspace:activated {undefined} — tab switched */
    bus.emit('workspace:activated');
  } else {
    // First time rendering this tab
    deps.renderWorkspace(tab);
  }
}

// ── Terminal CWD tracking (decoupled — no ctx dependency) ──

/**
 * Find which tab owns a given terminal id.
 * Returns the richer `{ tabId, tab }` format so callers needing just the tab
 * can destructure while callers needing the id (e.g. navigation) also get it.
 * @param {Map<string, WorkspaceTab>} tabs
 * @param {string} termId  - Terminal id to look up
 * @returns {{ tabId: string, tab: WorkspaceTab } | null}
 */
export function findTabForTerminal(tabs, termId) {
  for (const [tabId, tab] of tabs) {
    if (tab.terminalPanel?.terminals?.has(termId)) return { tabId, tab };
  }
  return null;
}

/**
 * Handle terminal cwd changes — update file tree and active-tab header.
 * @param {Map<string, WorkspaceTab>} tabs
 * @param {string|null} activeTabId
 * @param {string} termId  - Terminal id that changed
 * @param {string} cwd     - New working directory
 * @param {{ gitBranch: Function }} api - injected API methods
 */
export function onTerminalCwdChanged(tabs, activeTabId, termId, cwd, { gitBranch }) {
  const match = findTabForTerminal(tabs, termId);
  if (!match) return;
  const { tab } = match;

  // Update file tree (works even for inactive tabs)
  if (tab.fileTree) {
    tab.fileTree.setTerminalRoot(termId, cwd);
  }

  // Update header path/branch only for the active tab's active terminal
  if (
    tab.id === activeTabId &&
    tab.terminalPanel?.activeTerminal?.terminal?.id === termId
  ) {
    tab.cwd = cwd;
    if (tab.pathTextEl) tab.pathTextEl.textContent = cwd;
    if (tab.branchBadgeEl) {
      gitBranch(cwd).then((branch) => {
        if (tab.branchBadgeEl) {
          tab.branchBadgeEl.textContent = branch ? ` ${branch}` : '';
        }
      });
    }
  }
}
