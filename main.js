const { app } = require('electron');
const window = require('./main/window');
const ipcHandlers = require('./main/ipc-handlers');

app.whenReady().then(() => {
  const win = window.create();
  ipcHandlers.register(() => window.get());

  app.on('activate', () => {
    if (!window.get() || window.get().isDestroyed()) {
      window.create();
    }
  });
});

app.on('window-all-closed', () => {
  ipcHandlers.cleanup();
  if (process.platform !== 'darwin') app.quit();
});
