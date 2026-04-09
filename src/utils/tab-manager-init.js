/**
 * Tab manager initialization — extracted from tab-manager.js to reduce component size.
 *
 * Handles startup (default config restore) and bus event subscriptions.
 */

import { subscribeBus, EVENTS } from './events.js';
import { extractFolderName } from './file-tree-helpers.js';
import { findTabForTerminal, onTerminalCwdChanged } from './tab-lifecycle.js';

// ── Initialization ──

/**
 * @typedef {Object} InitDeps
 * @property {{ scheduleAutoSave: Function, currentConfigName: string }} configManager
 * @property {Function} renderActivityBar - () => void
 * @property {Function} restoreConfig     - (config) => Promise
 * @property {Function} createTab         - (name) => void
 * @property {{ homedir: Function, getDefault: Function, loadDefault: Function }} api
 */

/**
 * Run startup initialization: resolve home dir, render activity bar,
 * and restore default config (or create a fresh tab).
 *
 * @param {InitDeps} deps
 * @returns {Promise<string>} the resolved default cwd
 */
export async function initTabManager(deps) {
  const defaultCwd = await deps.api.homedir();

  deps.renderActivityBar();

  try {
    const defaultName = await deps.api.getDefault();
    const defaultConfig = await deps.api.loadDefault();
    if (defaultConfig && defaultConfig.tabs && defaultConfig.tabs.length > 0) {
      deps.configManager.currentConfigName = defaultName;
      await deps.restoreConfig(defaultConfig);
    } else {
      deps.configManager.currentConfigName = 'Default';
      deps.createTab('Workspace 1');
    }
  } catch (e) {
    console.warn('Failed to restore config:', e);
    deps.configManager.currentConfigName = 'Default';
    deps.createTab('Workspace 1');
  }

  return defaultCwd;
}

// ── Bus listeners ──

/**
 * @typedef {Object} BusListenerDeps
 * @property {Map<string, Object>} tabs
 * @property {Function} getActiveTabId   - () => string|null
 * @property {{ scheduleAutoSave: Function }} configManager
 * @property {Function} createTab        - (name, cwd) => void
 * @property {{ gitBranch: Function }} api
 */

/**
 * Register bus event listeners for the tab manager.
 * Returns the subscription handle for cleanup.
 *
 * @param {BusListenerDeps} deps
 * @returns {Array} subscription handle
 */
export function setupBusListeners(deps) {
  return subscribeBus([
    /** @listens terminal:cwdChanged {{ id: string, cwd: string }} */
    [EVENTS.TERMINAL_CWD_CHANGED, ({ id, cwd }) => {
      onTerminalCwdChanged(deps.tabs, deps.getActiveTabId(), id, cwd, { gitBranch: deps.api.gitBranch });
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
  ]);
}
