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
  flowManager.start(getWindow, ptyManager);
  sessionManager.start(ptyManager);
  usageManager.init(sessionManager);

  // -- Build target map consumed by IPC dispatching --
  const { shell, clipboard } = require('electron');

  const targets = {
    pty: ptyManager,
    fs: fsManager,
    git: gitManager,
    config: configManager,
    flow: flowManager,
    usage: usageManager,
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
