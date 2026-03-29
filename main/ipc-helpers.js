/**
 * Pure helpers and declarative handler tables for IPC registration.
 * Keeps handler definitions (data) separate from handler binding (I/O).
 */

/** Send payload to renderer if window is available */
function safeSend(getWindow, channel, payload) {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

/**
 * Forward handlers: [channel, targetKey, method]
 * Registers ipcMain.handle(channel, (_, arg) => targets[targetKey][method](arg))
 * Works for single-arg or no-arg calls.
 */
const FORWARD_TABLE = [
  // PTY
  ['pty:checkAgents', 'pty', 'checkAgents'],
  // File System
  ['fs:readdir',  'fs', 'readDirectory'],
  ['fs:readfile', 'fs', 'readFile'],
  ['fs:mkdir',    'fs', 'makeDir'],
  ['fs:homedir',  'fs', 'getHomedir'],
  ['fs:copy',     'fs', 'copyEntry'],
  // Shell / Clipboard
  ['shell:showInFolder', 'shell', 'showItemInFolder'],
  ['shell:openExternal', 'shell', 'openExternal'],
  ['shell:openPath',     'shell', 'openPath'],
  ['clipboard:write',    'clipboard', 'writeText'],
  // Git
  ['git:branch',       'git', 'getBranch'],
  ['git:remote',       'git', 'getRemoteUrl'],
  ['git:localChanges', 'git', 'getLocalChanges'],
  // Workspace Configs
  ['config:load',        'config', 'load'],
  ['config:list',        'config', 'list'],
  ['config:delete',      'config', 'remove'],
  ['config:setDefault',  'config', 'setDefault'],
  ['config:getDefault',  'config', 'getDefault'],
  ['config:loadDefault', 'config', 'loadDefault'],
  // Flows
  ['flow:save',       'flow', 'save'],
  ['flow:get',        'flow', 'get'],
  ['flow:list',       'flow', 'list'],
  ['flow:delete',     'flow', 'remove'],
  ['flow:toggle',     'flow', 'toggleEnabled'],
  ['flow:runNow',     'flow', 'runNow'],
  ['flow:getRunning',    'flow', 'getRunning'],
  ['flow:getCategories', 'flow', 'getCategories'],
  ['flow:saveCategories', 'flow', 'saveCategories'],
  // Usage
  ['usage:getMetrics', 'usage', 'getMetrics'],
];

/**
 * Spread handlers: [channel, targetKey, method, keys]
 * Destructures the object arg and spreads keys as positional args.
 * Registers ipcMain.handle(channel, (_, arg) => targets[targetKey][method](...keys.map(k => arg[k])))
 */
const SPREAD_TABLE = [
  // PTY
  ['pty:write',  'pty', 'write',  ['id', 'data']],
  ['pty:resize', 'pty', 'resize', ['id', 'cols', 'rows']],
  ['pty:kill',   'pty', 'kill',   ['id']],
  ['pty:getcwd', 'pty', 'getCwd', ['id']],
  // File System
  ['fs:writefile', 'fs', 'writeFile',  ['filePath', 'content']],
  ['fs:rename',    'fs', 'renameEntry', ['oldPath', 'newName']],
  ['fs:copyTo',    'fs', 'copyFileTo', ['srcPath', 'destDir']],
  ['fs:unwatch',   'fs', 'unwatchDir', ['id']],
  // Git
  ['git:fileDiff', 'git', 'getFileDiff', ['cwd', 'filePath', 'isStaged']],
  // Workspace Configs
  ['config:save', 'config', 'save', ['name', 'data']],
  // Flows
  ['flow:getRunLog', 'flow', 'getRunLog', ['flowId', 'logTimestamp']],
];

module.exports = { safeSend, FORWARD_TABLE, SPREAD_TABLE };
