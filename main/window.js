const { BrowserWindow } = require('electron');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const WINDOW_DEFAULTS = {
  width: 1400,
  height: 900,
  minWidth: 900,
  minHeight: 600,
};

let mainWindow = null;

function create() {
  mainWindow = new BrowserWindow({
    ...WINDOW_DEFAULTS,
    title: 'Pickagent',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadFile(path.join(ROOT, 'src', 'index.html'));
  return mainWindow;
}

function get() {
  return mainWindow;
}

module.exports = { create, get };
