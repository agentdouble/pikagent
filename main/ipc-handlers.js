const { ipcMain } = require('electron');
const PtyManager = require('./pty-manager');
const { registerManagerHandlers, safeSend } = require('./ipc-helpers');

const ptyManager = new PtyManager();
const sessionManager = require('./session-manager');
const fsManager = require('./fs-manager');
const gitManager = require('./git-manager');
const configManager = require('./config-manager');
const flowManager = require('./flow-manager');
const usageManager = require('./usage-manager');

/**
 * Modules that need lifecycle hooks (start / cleanup).
 * Custom (non-table) IPC handlers are registered per-module below.
 */
const LIFECYCLE_MODULES = [
  sessionManager,
  ptyManager,
  fsManager,
  flowManager,
  usageManager,
];

function register(getWindow) {
  const { shell, clipboard, dialog } = require('electron');

  // -- Build target map used by FORWARD_TABLE / SPREAD_TABLE --
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

  // Channels with custom handlers (registered below) — skip declarative registration.
  const customChannels = new Set(['pty:create', 'fs:watch', 'fs:trash', 'dialog:openFolder']);

  // Register all declarative forward/spread handlers in one pass.
  registerManagerHandlers(ipcMain, targets, customChannels);

  // -- Custom handlers that cannot be expressed declaratively --

  // PTY: create needs onData/onExit wiring
  ipcMain.handle('pty:create', (_, { id, cwd, cols, rows }) => {
    const proc = ptyManager.create({ id, cwd, cols, rows });
    proc.onData((data) => safeSend(getWindow, 'pty:data', { id, data }));
    proc.onExit(({ exitCode }) => {
      ptyManager.processes.delete(id);
      sessionManager.onTerminalExit(id);
      safeSend(getWindow, 'pty:exit', { id, exitCode });
    });
    return { pid: proc.pid };
  });

  // FS: watch needs safeSend callback
  ipcMain.handle('fs:watch', (_, { id, dirPath }) => {
    fsManager.watchDir(id, dirPath, (change) => {
      safeSend(getWindow, 'fs:changed', change);
    });
  });

  // FS: trash needs Electron shell
  ipcMain.handle('fs:trash', async (_, filePath) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  // Dialog: needs window reference
  ipcMain.handle('dialog:openFolder', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  // -- Lifecycle: start managers that need runtime context --
  flowManager.start(getWindow, ptyManager);
  sessionManager.start(ptyManager);
  usageManager.init(sessionManager);
}

function cleanup() {
  for (const mod of LIFECYCLE_MODULES) {
    if (typeof mod.cleanup === 'function') mod.cleanup();
  }
}

module.exports = { register, cleanup };
