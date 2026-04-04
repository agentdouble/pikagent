const { ipcMain, shell, clipboard, dialog } = require('electron');
const PtyManager = require('./pty-manager');
const fsManager = require('./fs-manager');
const gitManager = require('./git-manager');
const configManager = require('./config-manager');
const flowManager = require('./flow-manager');
const sessionManager = require('./session-manager');
const usageManager = require('./usage-manager');
const updateManager = require('./update-manager');
const { safeSend, FORWARD_TABLE, SPREAD_TABLE } = require('./ipc-helpers');

const ptyManager = new PtyManager();

const TARGETS = {
  pty: ptyManager,
  fs: fsManager,
  git: gitManager,
  config: configManager,
  flow: flowManager,
  usage: usageManager,
  update: updateManager,
  shell,
  clipboard,
};

function register(getWindow) {
  for (const [channel, key, method] of FORWARD_TABLE) {
    ipcMain.handle(channel, (_, arg) => TARGETS[key][method](arg));
  }

  for (const [channel, key, method, keys] of SPREAD_TABLE) {
    ipcMain.handle(channel, (_, arg) => TARGETS[key][method](...keys.map(k => arg[k])));
  }

  // --- Custom handlers (require special logic) ---

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

  ipcMain.handle('fs:watch', (_, { id, dirPath }) => {
    fsManager.watchDir(id, dirPath, (change) => {
      safeSend(getWindow, 'fs:changed', change);
    });
  });

  ipcMain.handle('fs:trash', async (_, filePath) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('dialog:openFolder', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('update:run', async () => {
    return updateManager.performUpdate((progress) => {
      safeSend(getWindow, 'update:progress', progress);
    });
  });

  ipcMain.handle('update:relaunch', () => updateManager.relaunch());

  updateManager.init();
  flowManager.start(getWindow, ptyManager);
  sessionManager.start(ptyManager);
}

function cleanup() {
  sessionManager.stop();
  flowManager.stop();
  ptyManager.killAll();
  fsManager.unwatchAll();
}

module.exports = { register, cleanup };
