const { ipcMain, shell, clipboard } = require('electron');
const PtyManager = require('./pty-manager');
const fsManager = require('./fs-manager');
const gitManager = require('./git-manager');
const configManager = require('./config-manager');

const ptyManager = new PtyManager();

function register(getWindow) {
  // --- PTY ---
  ipcMain.handle('pty:create', (event, { id, cwd, cols, rows }) => {
    const proc = ptyManager.create({ id, cwd, cols, rows });
    const win = getWindow();

    proc.onData((data) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('pty:data', { id, data });
      }
    });

    proc.onExit(({ exitCode }) => {
      ptyManager.processes.delete(id);
      if (win && !win.isDestroyed()) {
        win.webContents.send('pty:exit', { id, exitCode });
      }
    });

    return { pid: proc.pid };
  });

  ipcMain.handle('pty:write', (event, { id, data }) => {
    ptyManager.write(id, data);
  });

  ipcMain.handle('pty:resize', (event, { id, cols, rows }) => {
    ptyManager.resize(id, cols, rows);
  });

  ipcMain.handle('pty:kill', (event, { id }) => {
    ptyManager.kill(id);
  });

  ipcMain.handle('pty:getcwd', (event, { id }) => {
    return ptyManager.getCwd(id);
  });

  // --- File System ---
  ipcMain.handle('fs:readdir', (event, dirPath) => {
    return fsManager.readDirectory(dirPath);
  });

  ipcMain.handle('fs:readfile', (event, filePath) => {
    return fsManager.readFile(filePath);
  });

  ipcMain.handle('fs:mkdir', (event, dirPath) => {
    return fsManager.makeDir(dirPath);
  });

  ipcMain.handle('fs:writefile', (event, { filePath, content }) => {
    return fsManager.writeFile(filePath, content);
  });

  ipcMain.handle('fs:homedir', () => {
    return fsManager.getHomedir();
  });

  ipcMain.handle('fs:copy', (event, filePath) => {
    return fsManager.copyEntry(filePath);
  });

  ipcMain.handle('fs:watch', (event, { id, dirPath }) => {
    const win = getWindow();
    fsManager.watchDir(id, dirPath, (change) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('fs:changed', change);
      }
    });
  });

  ipcMain.handle('fs:unwatch', (event, { id }) => {
    fsManager.unwatchDir(id);
  });

  // --- Shell / Clipboard ---
  ipcMain.handle('shell:showInFolder', (event, filePath) => {
    shell.showItemInFolder(filePath);
  });

  ipcMain.handle('fs:trash', async (event, filePath) => {
    try {
      await shell.trashItem(filePath);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  });

  ipcMain.handle('clipboard:write', (event, text) => {
    clipboard.writeText(text);
  });

  // --- Git ---
  ipcMain.handle('git:branch', (event, cwd) => {
    return gitManager.getBranch(cwd);
  });

  ipcMain.handle('git:remote', (event, cwd) => {
    return gitManager.getRemoteUrl(cwd);
  });

  // --- Workspace Configs ---
  ipcMain.handle('config:save', (event, { name, data }) => {
    return configManager.save(name, data);
  });

  ipcMain.handle('config:load', (event, name) => {
    return configManager.load(name);
  });

  ipcMain.handle('config:list', () => {
    return configManager.list();
  });

  ipcMain.handle('config:delete', (event, name) => {
    return configManager.remove(name);
  });

  ipcMain.handle('config:setDefault', (event, name) => {
    return configManager.setDefault(name);
  });

  ipcMain.handle('config:getDefault', () => {
    return configManager.getDefault();
  });

  ipcMain.handle('config:loadDefault', () => {
    return configManager.loadDefault();
  });
}

function cleanup() {
  ptyManager.killAll();
  fsManager.unwatchAll();
}

module.exports = { register, cleanup };
