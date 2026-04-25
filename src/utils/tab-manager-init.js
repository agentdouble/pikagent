/**
 * Tab manager initialization — extracted from tab-manager.js to reduce component size.
 *
 * Handles startup (default config restore) and bus event subscriptions.
 * Also re-exports utilities consumed exclusively by tab-manager.js so that
 * it can import from fewer modules (issue #130).
 */

import { subscribeBus, EVENTS } from './events.js';
import { extractFolderName } from './file-tree-helpers.js';
import { findTabForTerminal, onTerminalCwdChanged } from './tab-lifecycle.js';
import { createWorktreeFlow } from './worktree-flow.js';
import { openPrFlow } from './open-pr-flow.js';

export { unsubscribeBus } from './events.js';
export { getComponent } from './component-registry.js';

// ── Initialization ──

/**
 * @typedef {{ configManager: { scheduleAutoSave: () => void, currentConfigName: string }, renderActivityBar: () => void, restoreConfig: (config: unknown) => Promise<void>, createTab: (name: string) => void, setDefaultCwd: (cwd: string) => void, api: { homedir: () => Promise<string>, getDefault: () => Promise<string>, loadDefault: () => Promise<unknown> } }} InitDeps
 */

/**
 * Run startup initialization: resolve home dir, render activity bar,
 * and restore default config (or create a fresh tab).
 *
 * The default cwd is published via `setDefaultCwd` BEFORE any tab is created
 * or restored, so downstream code that reads `deps.defaultCwd` (createTab,
 * restoreConfig) always sees the resolved home dir.
 *
 * @param {InitDeps} deps
 * @returns {Promise<string>} the resolved default cwd
 */
export async function initTabManager(deps) {
  const defaultCwd = await deps.api.homedir();
  deps.setDefaultCwd(defaultCwd);

  deps.renderActivityBar();

  try {
    const defaultName = await deps.api.getDefault();
    const defaultConfig = await deps.api.loadDefault();
    if (defaultConfig && defaultConfig.tabs && defaultConfig.tabs.length > 0) {
      deps.configManager.currentConfigName = defaultName;
      await deps.restoreConfig(defaultConfig);
    } else {
      deps.configManager.currentConfigName = 'Default';
      deps.createTab();
    }
  } catch (e) {
    console.warn('Failed to restore config:', e);
    deps.configManager.currentConfigName = 'Default';
    deps.createTab();
  }

  return defaultCwd;
}

// ── Bus listeners ──

/**
 * @typedef {{ tabs: Map<string, import('./tab-constants.js').WorkspaceTab>, getActiveTabId: () => string|null, configManager: { scheduleAutoSave: () => void }, createTab: (name: string, cwd: string) => import('./tab-constants.js').WorkspaceTab, renderTabBar: () => void, api: { gitBranch: (cwd: string) => Promise<string|null>, worktree: import('./worktree-flow.js').GitWorktreeApi, pr: import('./open-pr-flow.js').OpenPrApi } }} BusListenerDeps
 */

/**
 * Register bus event listeners for the tab manager.
 * Returns the subscription handle for cleanup.
 *
 * @param {BusListenerDeps} deps
 * @returns {Array<() => void>} subscription handle
 */
export function setupBusListeners(deps) {
  return subscribeBus([
    /** @listens terminal:cwdChanged {{ id: string, cwd: string }} */
    [EVENTS.TERMINAL_CWD_CHANGED, ({ id, cwd }) => {
      onTerminalCwdChanged(deps.tabs, deps.getActiveTabId(), id, cwd, {
        gitBranch: deps.api.gitBranch,
        renderTabBar: deps.renderTabBar,
      });
      deps.configManager.scheduleAutoSave();
    }],
    /** @listens terminal:created {{ id: string, cwd: string }} */
    [EVENTS.TERMINAL_CREATED, ({ id, cwd }) => {
      const tab = findTabForTerminal(deps.tabs, id)?.tab ?? deps.tabs.get(deps.getActiveTabId());
      if (tab?.fileTree) tab.fileTree.setTerminalRoot(id, cwd);
      deps.configManager.scheduleAutoSave();
    }],
    /** @listens terminal:removed {{ id: string }} */
    [EVENTS.TERMINAL_REMOVED, ({ id }) => {
      for (const [, tab] of deps.tabs) {
        if (tab.fileTree) tab.fileTree.removeTerminal(id);
      }
      deps.configManager.scheduleAutoSave();
    }],
    /** @listens layout:changed {undefined} */
    [EVENTS.LAYOUT_CHANGED, () => deps.configManager.scheduleAutoSave()],
    /** @listens workspace:openFromFolder {{ cwd: string }} */
    [EVENTS.WORKSPACE_OPEN_FROM_FOLDER, ({ cwd }) => {
      const folderName = extractFolderName(cwd);
      deps.createTab(folderName, cwd);
    }],
    /** @listens workspace:createWorktree {{ repoCwd: string }} */
    [EVENTS.WORKSPACE_CREATE_WORKTREE, ({ repoCwd }) => {
      createWorktreeFlow({
        repoCwd,
        api: deps.api.worktree,
        createTab: deps.createTab,
      }).catch((e) => console.warn('createWorktreeFlow failed:', e));
    }],
    /** @listens workspace:openPr {{ repoCwd: string }} */
    [EVENTS.WORKSPACE_OPEN_PR, ({ repoCwd }) => {
      const tab = _findTabByCwd(deps.tabs, repoCwd);
      const baseBranch = tab?.worktree?.baseBranch ?? null;
      openPrFlow({ cwd: repoCwd, baseBranch, api: deps.api.pr })
        .catch((e) => console.warn('openPrFlow failed:', e));
    }],
  ]);
}

function _findTabByCwd(tabs, cwd) {
  for (const tab of tabs.values()) {
    if (tab.cwd === cwd) return tab;
  }
  return null;
}
