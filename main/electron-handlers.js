const { shell, clipboard, dialog } = require('electron');
const { registerForward } = require('./ipc-helpers');

function registerHandlers(ipcMain, { getWindow }) {
  registerForward(ipcMain, shell, [
    ['shell:showInFolder', 'showItemInFolder'],
    ['shell:openExternal', 'openExternal'],
    ['shell:openPath',     'openPath'],
  ]);

  registerForward(ipcMain, clipboard, [
    ['clipboard:write', 'writeText'],
  ]);

  ipcMain.handle('dialog:openFolder', async () => {
    const win = getWindow();
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
}

module.exports = { registerHandlers };
