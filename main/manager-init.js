/**
 * Manager initialization and dependency wiring.
 *
 * Centralises the creation of every manager singleton and the inter-manager
 * dependencies that used to live inside ipc-handlers.js.  The main entry
 * point calls `initManagers()` once and passes the result to the IPC layer.
 */

const PtyManager = require('./pty-manager');
const sessionManager = require('./session-manager');
const fsManager = require('./fs-manager');
const gitManager = require('./git-manager');
const configManager = require('./config-manager');
const flowManager = require('./flow-manager');
const usageManager = require('./usage-manager');
const updateManager = require('./update-manager');
const { safeSend } = require('./ipc-helpers');

const ptyManager = new PtyManager();

/**
 * Modules that expose a `cleanup()` method and should be torn down when
 * the application closes.
 */
const LIFECYCLE_MODULES = [
  sessionManager,
  ptyManager,
  fsManager,
  flowManager,
  usageManager,
];

/**
 * Wire inter-manager dependencies and start runtime services.
 *
 * @param {() => import('electron').BrowserWindow} getWindow
 * @returns {{ targets: Record<string, object>, cleanup: () => void }}
 */
function initManagers(getWindow) {
  // -- Lifecycle: start managers that need runtime context --
  updateManager.init();
  flowManager.start(getWindow, ptyManager);
  sessionManager.start(ptyManager);
  usageManager.init(sessionManager);

  // -- Build target map consumed by IPC dispatching --
  const { shell, clipboard } = require('electron');

  // Adapter: update-manager exposes functional names (checkForUpdates,
  // getVersion, performUpdate); the IPC schema uses shorter aliases
  // (check, version, run) and `run` needs a per-call progress callback.
  const updateTarget = {
    check:    () => updateManager.checkForUpdates(),
    version:  () => updateManager.getVersion(),
    relaunch: () => updateManager.relaunch(),
    run:      () => updateManager.performUpdate((p) => safeSend(getWindow, 'update:progress', p)),
  };

  const targets = {
    pty: ptyManager,
    fs: fsManager,
    git: gitManager,
    config: configManager,
    flow: flowManager,
    usage: usageManager,
    update: updateTarget,
    shell,
    clipboard,
  };

  function cleanup() {
    for (const mod of LIFECYCLE_MODULES) {
      if (typeof mod.cleanup === 'function') mod.cleanup();
    }
  }

  return { targets, cleanup, ptyManager, sessionManager };
}

module.exports = { initManagers };
