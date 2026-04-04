const { ipcMain } = require('electron');
const PtyManager = require('./pty-manager');

const ptyManager = new PtyManager();

/**
 * Handler modules registry.
 * Each module must export a registerHandlers(ipcMain, context) function.
 * To add a new manager, simply append it to this array.
 */
const HANDLER_MODULES = [
  require('./session-manager'),
  ptyManager,
  require('./fs-manager'),
  require('./git-manager'),
  require('./config-manager'),
  require('./flow-manager'),
  require('./usage-manager'),
  require('./electron-handlers'),
];

function register(getWindow) {
  const sessionManager = require('./session-manager');

  const context = {
    getWindow,
    ptyManager,
    sessionManager,
  };

  for (const mod of HANDLER_MODULES) {
    mod.registerHandlers(ipcMain, context);
  }
}

function cleanup() {
  const sessionManager = require('./session-manager');
  const flowManager = require('./flow-manager');
  const fsManager = require('./fs-manager');

  sessionManager.stop();
  flowManager.stop();
  ptyManager.killAll();
  fsManager.unwatchAll();
}

module.exports = { register, cleanup };
