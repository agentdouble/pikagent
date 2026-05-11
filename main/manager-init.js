/**
 * Manager initialization and dependency wiring.
 *
 * Centralises the creation of every manager singleton and the inter-manager
 * dependencies that used to live inside ipc-handlers.js.  The main entry
 * point calls `initManagers()` once and passes the result to the IPC layer.
 *
 * Managers are imported through a single consolidated barrel module:
 *
 *   managers.js — ptyManager, fsManager, sessionManager, usageManager,
 *                 flowManager, skillsManager, gitManager, configManager,
 *                 updateManager
 *
 * NOTE: PR #469 will replace the eager `require('./managers')` with lazy
 * getters so that each manager is loaded on first access.  The string-based
 * LIFECYCLE_NAMES list (rather than direct references) is intentionally
 * structured to align with that upcoming change.
 */

const managers = require('./managers');
const { safeSend } = require('./ipc-helpers');

/**
 * Names of managers that expose a `cleanup()` method and should be torn
 * down when the application closes.
 */
const LIFECYCLE_NAMES = [
  'sessionManager',
  'ptyManager',
  'fsManager',
  'flowManager',
  'usageManager',
];

/**
 * Wire inter-manager dependencies and start runtime services.
 *
 * @param {() => import('electron').BrowserWindow} getWindow
 * @returns {{ targets: Record<string, object>, cleanup: () => void }}
 */
function initManagers(getWindow) {
  // -- Lifecycle: start managers that need runtime context --
  // Access order matters: updateManager first, then flow, session, usage.
  managers.updateManager.init();
  managers.flowManager.start(getWindow, managers.ptyManager);
  managers.sessionManager.start(managers.ptyManager);
  managers.usageManager.init(managers.sessionManager);

  // -- Build target map consumed by IPC dispatching --
  const { shell, clipboard } = require('electron');

  // Adapter: update-manager exposes functional names (checkForUpdates,
  // getVersion, performUpdate); the IPC schema uses shorter aliases
  // (check, version, run) and `run` needs a per-call progress callback.
  const updateTarget = {
    check:    () => managers.updateManager.checkForUpdates(),
    version:  () => managers.updateManager.getVersion(),
    relaunch: () => managers.updateManager.relaunch(),
    run:      () => managers.updateManager.performUpdate((p) => safeSend(getWindow, 'update:progress', p)),
  };

  const targets = {
    pty:       managers.ptyManager,
    fs:        managers.fsManager,
    git:       managers.gitManager,
    config:    managers.configManager,
    flow:      managers.flowManager,
    usage:     managers.usageManager,
    skills:    managers.skillsManager,
    update:    updateTarget,
    shell,
    clipboard,
  };

  function cleanup() {
    for (const name of LIFECYCLE_NAMES) {
      const mod = managers[name];
      if (typeof mod.cleanup === 'function') mod.cleanup();
    }
  }

  return { targets, cleanup, ptyManager: managers.ptyManager, sessionManager: managers.sessionManager };
}

module.exports = { initManagers };
