const { contextBridge, ipcRenderer } = require('electron');

// Generic IPC listener helper (for non-PTY channels)
function onIpc(channel) {
  return (cb) => {
    const listener = (event, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

// Targeted dispatch maps for PTY: one IPC listener, routed by terminal ID
const _dataListeners = new Map(); // id → Set<callback>
const _exitListeners = new Map(); // id → Set<callback>

ipcRenderer.on('pty:data', (event, { id, data }) => {
  const cbs = _dataListeners.get(id);
  if (cbs) for (const cb of cbs) cb(data);
});

ipcRenderer.on('pty:exit', (event, { id, exitCode }) => {
  const cbs = _exitListeners.get(id);
  if (cbs) for (const cb of cbs) cb({ id, exitCode });
});

contextBridge.exposeInMainWorld('api', {
  // PTY
  pty: {
    create: (opts) => ipcRenderer.invoke('pty:create', opts),
    write: (opts) => ipcRenderer.invoke('pty:write', opts),
    resize: (opts) => ipcRenderer.invoke('pty:resize', opts),
    kill: (opts) => ipcRenderer.invoke('pty:kill', opts),
    getCwd: (opts) => ipcRenderer.invoke('pty:getcwd', opts),
    checkAgents: () => ipcRenderer.invoke('pty:checkAgents'),
    onData: (id, cb) => {
      if (!_dataListeners.has(id)) _dataListeners.set(id, new Set());
      _dataListeners.get(id).add(cb);
      return () => {
        const set = _dataListeners.get(id);
        if (set) { set.delete(cb); if (set.size === 0) _dataListeners.delete(id); }
      };
    },
    onExit: (id, cb) => {
      if (!_exitListeners.has(id)) _exitListeners.set(id, new Set());
      _exitListeners.get(id).add(cb);
      return () => {
        const set = _exitListeners.get(id);
        if (set) { set.delete(cb); if (set.size === 0) _exitListeners.delete(id); }
      };
    },
  },

  // File System
  fs: {
    readdir: (dirPath) => ipcRenderer.invoke('fs:readdir', dirPath),
    readfile: (filePath) => ipcRenderer.invoke('fs:readfile', filePath),
    writefile: (filePath, content) => ipcRenderer.invoke('fs:writefile', { filePath, content }),
    mkdir: (dirPath) => ipcRenderer.invoke('fs:mkdir', dirPath),
    trash: (filePath) => ipcRenderer.invoke('fs:trash', filePath),
    homedir: () => ipcRenderer.invoke('fs:homedir'),
    copy: (filePath) => ipcRenderer.invoke('fs:copy', filePath),
    rename: (oldPath, newName) => ipcRenderer.invoke('fs:rename', { oldPath, newName }),
    watch: (id, dirPath) => ipcRenderer.invoke('fs:watch', { id, dirPath }),
    unwatch: (id) => ipcRenderer.invoke('fs:unwatch', { id }),
    onChanged: onIpc('fs:changed'),
  },

  // Shell / Clipboard
  shell: {
    showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  },
  clipboard: {
    write: (text) => ipcRenderer.invoke('clipboard:write', text),
  },
  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  // Git
  git: {
    branch: (cwd) => ipcRenderer.invoke('git:branch', cwd),
    remote: (cwd) => ipcRenderer.invoke('git:remote', cwd),
    localChanges: (cwd) => ipcRenderer.invoke('git:localChanges', cwd),
    fileDiff: (cwd, filePath, isStaged) => ipcRenderer.invoke('git:fileDiff', { cwd, filePath, isStaged }),
  },

  // Flows
  flow: {
    save: (flow) => ipcRenderer.invoke('flow:save', flow),
    get: (id) => ipcRenderer.invoke('flow:get', id),
    list: () => ipcRenderer.invoke('flow:list'),
    delete: (id) => ipcRenderer.invoke('flow:delete', id),
    toggle: (id) => ipcRenderer.invoke('flow:toggle', id),
    runNow: (id) => ipcRenderer.invoke('flow:runNow', id),
    getRunning: () => ipcRenderer.invoke('flow:getRunning'),
    getRunLog: (flowId, logTimestamp) => ipcRenderer.invoke('flow:getRunLog', { flowId, logTimestamp }),
    onRunStarted: onIpc('flow:runStarted'),
    onRunComplete: onIpc('flow:runComplete'),
  },

  // Usage Metrics
  usage: {
    getMetrics: () => ipcRenderer.invoke('usage:getMetrics'),
  },

  // Workspace Configs
  config: {
    save: (name, data) => ipcRenderer.invoke('config:save', { name, data }),
    load: (name) => ipcRenderer.invoke('config:load', name),
    list: () => ipcRenderer.invoke('config:list'),
    delete: (name) => ipcRenderer.invoke('config:delete', name),
    setDefault: (name) => ipcRenderer.invoke('config:setDefault', name),
    getDefault: () => ipcRenderer.invoke('config:getDefault'),
    loadDefault: () => ipcRenderer.invoke('config:loadDefault'),
  },
});
