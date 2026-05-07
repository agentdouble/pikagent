const { ipcMain } = require('electron');
const { registerManagerHandlers, safeSend } = require('./ipc-helpers');
const { createSafeHandler } = require('./safe-handler');

/**
 * Channels with custom handlers (registered manually in `register()`).
 */
const CUSTOM_CHANNELS = ['pty:create', 'fs:watch', 'fs:trash', 'dialog:openFolder'];

/**
 * Register all IPC handlers.
 *
 * Manager initialization and dependency wiring are handled externally by
 * `manager-init.js`.  This module only cares about IPC dispatching.
 *
 * @param {() => import('electron').BrowserWindow} getWindow
 * @param {{ targets: Record<string, Record<string, (...args: unknown[]) => unknown>>, ptyManager: { create: (opts: { id: string, cwd: string, cols: number, rows: number }) => { pid: number, onData: (cb: (data: string) => void) => void, onExit: (cb: (info: { exitCode: number }) => void) => void }, processes: Map<string, unknown> }, sessionManager: { onTerminalExit: (id: string) => void } }} deps
 */
function register(getWindow, { targets, ptyManager, sessionManager }) {
  const { shell, dialog } = require('electron');

  const customSet = new Set(CUSTOM_CHANNELS);

  // Register all declarative forward/spread handlers in one pass.
  registerManagerHandlers(ipcMain, targets, customSet);

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
    targets.fs.watchDir(id, dirPath, (change) => {
      safeSend(getWindow, 'fs:changed', change);
    });
  });

  // FS: trash needs Electron shell
  ipcMain.handle('fs:trash', createSafeHandler(async (_, filePath) => {
    await shell.trashItem(filePath);
  }));

  // Dialog: needs window reference
  ipcMain.handle('dialog:openFolder', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
}

module.exports = { register };
