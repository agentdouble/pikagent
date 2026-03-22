const { ipcMain, shell, clipboard, dialog } = require('electron');
const PtyManager = require('./pty-manager');
const fsManager = require('./fs-manager');
const gitManager = require('./git-manager');
const configManager = require('./config-manager');
const flowManager = require('./flow-manager');
const sessionManager = require('./session-manager');
const usageManager = require('./usage-manager');

const ptyManager = new PtyManager();

/** Send payload to renderer if window is available */
function _safeSend(getWindow, channel, payload) {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

/**
 * Forward handlers: [channel, target, method]
 * Registers ipcMain.handle(channel, (_, arg) => target[method](arg))
 * Works for single-arg or no-arg calls.
 */
const FORWARD_HANDLERS = [
  // PTY
  ['pty:checkAgents', ptyManager, 'checkAgents'],
  // File System
  ['fs:readdir',  fsManager, 'readDirectory'],
  ['fs:readfile', fsManager, 'readFile'],
  ['fs:mkdir',    fsManager, 'makeDir'],
  ['fs:homedir',  fsManager, 'getHomedir'],
  ['fs:copy',     fsManager, 'copyEntry'],
  // Shell / Clipboard
  ['shell:showInFolder', shell, 'showItemInFolder'],
  ['shell:openExternal', shell, 'openExternal'],
  ['clipboard:write',    clipboard, 'writeText'],
  // Git
  ['git:branch',       gitManager, 'getBranch'],
  ['git:remote',       gitManager, 'getRemoteUrl'],
  ['git:localChanges', gitManager, 'getLocalChanges'],
  // Workspace Configs
  ['config:load',        configManager, 'load'],
  ['config:list',        configManager, 'list'],
  ['config:delete',      configManager, 'remove'],
  ['config:setDefault',  configManager, 'setDefault'],
  ['config:getDefault',  configManager, 'getDefault'],
  ['config:loadDefault', configManager, 'loadDefault'],
  // Flows
  ['flow:save',       flowManager, 'save'],
  ['flow:get',        flowManager, 'get'],
  ['flow:list',       flowManager, 'list'],
  ['flow:delete',     flowManager, 'remove'],
  ['flow:toggle',     flowManager, 'toggleEnabled'],
  ['flow:runNow',     flowManager, 'runNow'],
  ['flow:getRunning', flowManager, 'getRunning'],
  // Usage
  ['usage:getMetrics', usageManager, 'getMetrics'],
];

/**
 * Spread handlers: [channel, target, method, keys]
 * Destructures the object arg and spreads keys as positional args.
 * Registers ipcMain.handle(channel, (_, arg) => target[method](...keys.map(k => arg[k])))
 */
const SPREAD_HANDLERS = [
  // PTY
  ['pty:write',  ptyManager, 'write',  ['id', 'data']],
  ['pty:resize', ptyManager, 'resize', ['id', 'cols', 'rows']],
  ['pty:kill',   ptyManager, 'kill',   ['id']],
  ['pty:getcwd', ptyManager, 'getCwd', ['id']],
  // File System
  ['fs:writefile', fsManager, 'writeFile',  ['filePath', 'content']],
  ['fs:rename',    fsManager, 'renameEntry', ['oldPath', 'newName']],
  ['fs:copyTo',    fsManager, 'copyFileTo', ['srcPath', 'destDir']],
  ['fs:unwatch',   fsManager, 'unwatchDir', ['id']],
  // Git
  ['git:fileDiff', gitManager, 'getFileDiff', ['cwd', 'filePath', 'isStaged']],
  // Workspace Configs
  ['config:save', configManager, 'save', ['name', 'data']],
  // Flows
  ['flow:getRunLog', flowManager, 'getRunLog', ['flowId', 'logTimestamp']],
];

function register(getWindow) {
  for (const [channel, target, method] of FORWARD_HANDLERS) {
    ipcMain.handle(channel, (_, arg) => target[method](arg));
  }

  for (const [channel, target, method, keys] of SPREAD_HANDLERS) {
    ipcMain.handle(channel, (_, arg) => target[method](...keys.map(k => arg[k])));
  }

  // --- Custom handlers (require special logic) ---

  ipcMain.handle('pty:create', (_, { id, cwd, cols, rows }) => {
    const proc = ptyManager.create({ id, cwd, cols, rows });
    proc.onData((data) => _safeSend(getWindow, 'pty:data', { id, data }));
    proc.onExit(({ exitCode }) => {
      ptyManager.processes.delete(id);
      sessionManager.onTerminalExit(id);
      _safeSend(getWindow, 'pty:exit', { id, exitCode });
    });
    return { pid: proc.pid };
  });

  ipcMain.handle('fs:watch', (_, { id, dirPath }) => {
    fsManager.watchDir(id, dirPath, (change) => {
      _safeSend(getWindow, 'fs:changed', change);
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
