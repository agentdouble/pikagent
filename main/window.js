const { BrowserWindow } = require('electron');
const path = require('path');

let mainWindow = null;

function create() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Pickagent',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));
  return mainWindow;
}

function get() {
  return mainWindow;
}

module.exports = { create, get };
