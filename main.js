const { app } = require('electron');
const window = require('./main/window');
const { initManagers } = require('./main/manager-init');
const ipcHandlers = require('./main/ipc-handlers');

app.setName('Pickagent');

let managerCleanup = null;

app.whenReady().then(() => {
  window.create();
  const getWindow = () => window.get();

  const { targets, cleanup, ptyManager, sessionManager } = initManagers(getWindow);
  managerCleanup = cleanup;

  ipcHandlers.register(getWindow, { targets, ptyManager, sessionManager });

  app.on('activate', () => {
    if (!window.get()) window.create();
  });
});

app.on('window-all-closed', () => {
  if (managerCleanup) managerCleanup();
  if (process.platform !== 'darwin') app.quit();
});

