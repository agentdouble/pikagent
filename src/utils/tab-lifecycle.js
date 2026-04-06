/**
 * Tab Lifecycle — extracted from tab-manager.js.
 *
 * Handles tab creation, removal, and activation (switchTo) logic.
 *
 * Functions that mutate state receive a narrow context object instead of
 * the full TabManager — see TabLifecycleCtx typedef below.
 * Pure lookup functions (findTabForTerminal, onTerminalCwdChanged) accept
 * only the data they need.
 *
 * @typedef {Object} TabLifecycleCtx
 * @property {Map<string, WorkspaceTab>} tabs
 * @property {string|null} activeTabId
 * @property {string} defaultCwd
 * @property {string|null} activeColorFilter
 * @property {string} sidebarMode
 * @property {Function} renderTabBar
 * @property {Function} renderActivityBar
 * @property {Function} renderWorkspace
 * @property {{ scheduleAutoSave: Function }} configManager
 */

import { generateId } from './id.js';
import { showConfirmDialog, _el } from './dom.js';
import { bus } from './events.js';
import { WorkspaceTab } from './tab-manager-helpers.js';
import {
  reattachLayout, syncFileTree, capturePanelWidths, disposeTab,
} from './workspace-layout.js';
import { detachSidebarView } from './sidebar-manager.js';

// ── Tab creation ──

/**
 * Create a new tab and switch to it.
 * @param {TabLifecycleCtx} ctx
 * @param {string|null} name - Optional tab name
 * @param {string|null} cwd  - Optional working directory
 * @returns {WorkspaceTab}
 */
export function createTab(ctx, name = null, cwd = null) {
  const id = generateId('tab');
  const tabName = name || `Workspace ${ctx.tabs.size + 1}`;
  const tab = new WorkspaceTab(id, tabName, cwd || ctx.defaultCwd || '/');
  if (ctx.activeColorFilter) tab.colorGroup = ctx.activeColorFilter;
  ctx.tabs.set(id, tab);
  ctx.renderTabBar();
  switchTo(ctx, id);
  ctx.configManager.scheduleAutoSave();
  return tab;
}

// ── Tab removal ──

/**
 * Close a tab by id, prompting the user for confirmation.
 * @param {TabLifecycleCtx} ctx
 * @param {string} id  - Tab id to close
 */
export async function closeTab(ctx, id) {
  const tab = ctx.tabs.get(id);
  if (!tab) return;

  const ok = await showConfirmDialog(
    _el('p', null, 'Close workspace ', _el('strong', null, tab.name), '?'),
    { confirmLabel: 'Close' },
  );
  if (!ok) return;

  disposeTab(tab);
  ctx.tabs.delete(id);

  if (ctx.tabs.size === 0) {
    createTab(ctx);
    return;
  }

  if (ctx.activeTabId === id) {
    const remaining = Array.from(ctx.tabs.values());
    switchTo(ctx, remaining[0].id);
  }

  ctx.renderTabBar();
  ctx.configManager.scheduleAutoSave();
}

// ── Tab activation ──

/**
 * Activate a tab by id, handling sidebar mode transitions and DOM attachment.
 * @param {TabLifecycleCtx} ctx
 * @param {string} id  - Tab id to activate
 */
export function switchTo(ctx, id) {
  const tab = ctx.tabs.get(id);
  if (!tab) return;

  // If in a non-work mode, switch back to work mode
  if (ctx.sidebarMode !== 'work') {
    detachSidebarView(ctx, ctx.sidebarMode);
    ctx.sidebarMode = 'work';
    ctx.renderActivityBar();

    // If this tab is already active, just re-show its layout
    if (id === ctx.activeTabId) {
      if (tab.layoutElement) {
        reattachLayout(ctx, tab);
        syncFileTree(tab);
        bus.emit('workspace:activated');
      }
      ctx.renderTabBar();
      return;
    }
  }

  if (id === ctx.activeTabId) return;

  // Detach outgoing tab (keep terminals alive!)
  if (ctx.activeTabId) {
    const prev = ctx.tabs.get(ctx.activeTabId);
    if (prev && prev.layoutElement) {
      // Capture panel widths before detaching (needs attached DOM)
      capturePanelWidths(prev);
      prev.layoutElement.remove();
    }
  }

  ctx.activeTabId = id;
  ctx.renderTabBar();

  if (tab.layoutElement) {
    reattachLayout(ctx, tab);
    syncFileTree(tab);
    bus.emit('workspace:activated');
  } else {
    // First time rendering this tab
    ctx.renderWorkspace(tab);
  }
}

// ── Terminal CWD tracking (decoupled — no ctx dependency) ──

/**
 * Find which tab owns a given terminal id.
 * @param {Map<string, WorkspaceTab>} tabs
 * @param {string} termId  - Terminal id to look up
 * @returns {WorkspaceTab|null}
 */
export function findTabForTerminal(tabs, termId) {
  for (const [, tab] of tabs) {
    if (tab.terminalPanel?.terminals?.has(termId)) return tab;
  }
  return null;
}

/**
 * Handle terminal cwd changes — update file tree and active-tab header.
 * @param {Map<string, WorkspaceTab>} tabs
 * @param {string|null} activeTabId
 * @param {string} termId  - Terminal id that changed
 * @param {string} cwd     - New working directory
 */
export function onTerminalCwdChanged(tabs, activeTabId, termId, cwd) {
  const tab = findTabForTerminal(tabs, termId);
  if (!tab) return;

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
      window.api.git.branch(cwd).then((branch) => {
        if (tab.branchBadgeEl) {
          tab.branchBadgeEl.textContent = branch ? ` ${branch}` : '';
        }
      });
    }
  }
}
