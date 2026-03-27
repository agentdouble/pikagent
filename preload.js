const { contextBridge, ipcRenderer } = require('electron');

// --- Helpers ---

/** Wraps ipcRenderer.on; returns unsubscribe function */
function _onIpc(channel) {
  return (cb) => {
    const listener = (_, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

/** Single-arg (or no-arg) forward to main process */
const _fwd = (ch) => (arg) => ipcRenderer.invoke(ch, arg);

/** Multi-arg forward: packs positional args into a keyed object */
const _pack = (ch, keys) => (...args) =>
  ipcRenderer.invoke(ch, Object.fromEntries(keys.map((k, i) => [k, args[i]])));

// --- Targeted PTY dispatch (one listener per event, routed by terminal ID) ---

const _dataListeners = new Map();
const _exitListeners = new Map();

ipcRenderer.on('pty:data', (_, { id, data }) => {
  const cbs = _dataListeners.get(id);
  if (cbs) for (const cb of cbs) cb(data);
});

ipcRenderer.on('pty:exit', (_, { id, exitCode }) => {
  const cbs = _exitListeners.get(id);
  if (cbs) for (const cb of cbs) cb({ id, exitCode });
});

/** Creates a subscribe/unsubscribe pair for a targeted PTY listener map */
function _ptyListener(map) {
  return (id, cb) => {
    if (!map.has(id)) map.set(id, new Set());
    map.get(id).add(cb);
    return () => {
      const set = map.get(id);
      if (set) { set.delete(cb); if (set.size === 0) map.delete(id); }
    };
  };
}

// --- Exposed API ---

contextBridge.exposeInMainWorld('api', {
  pty: {
    create:      _fwd('pty:create'),
    write:       _fwd('pty:write'),
    resize:      _fwd('pty:resize'),
    kill:        _fwd('pty:kill'),
    getCwd:      _fwd('pty:getcwd'),
    checkAgents: _fwd('pty:checkAgents'),
    onData:      _ptyListener(_dataListeners),
    onExit:      _ptyListener(_exitListeners),
  },

  fs: {
    readdir:   _fwd('fs:readdir'),
    readfile:  _fwd('fs:readfile'),
    mkdir:     _fwd('fs:mkdir'),
    homedir:   _fwd('fs:homedir'),
    copy:      _fwd('fs:copy'),
    trash:     _fwd('fs:trash'),
    writefile: _pack('fs:writefile', ['filePath', 'content']),
    rename:    _pack('fs:rename', ['oldPath', 'newName']),
    copyTo:    _pack('fs:copyTo', ['srcPath', 'destDir']),
    watch:     _pack('fs:watch', ['id', 'dirPath']),
    unwatch:   _pack('fs:unwatch', ['id']),
    onChanged: _onIpc('fs:changed'),
  },

  shell: {
    showInFolder: _fwd('shell:showInFolder'),
    openExternal: _fwd('shell:openExternal'),
    openPath:     _fwd('shell:openPath'),
  },
  clipboard: { write: _fwd('clipboard:write') },
  dialog:    { openFolder: _fwd('dialog:openFolder') },

  git: {
    branch:       _fwd('git:branch'),
    remote:       _fwd('git:remote'),
    localChanges: _fwd('git:localChanges'),
    fileDiff:     _pack('git:fileDiff', ['cwd', 'filePath', 'isStaged']),
  },

  flow: {
    save:          _fwd('flow:save'),
    get:           _fwd('flow:get'),
    list:          _fwd('flow:list'),
    delete:        _fwd('flow:delete'),
    toggle:        _fwd('flow:toggle'),
    runNow:        _fwd('flow:runNow'),
    getRunning:    _fwd('flow:getRunning'),
    getRunLog:     _pack('flow:getRunLog', ['flowId', 'logTimestamp']),
    getCategories: _fwd('flow:getCategories'),
    saveCategories: _fwd('flow:saveCategories'),
    onRunStarted:  _onIpc('flow:runStarted'),
    onRunComplete: _onIpc('flow:runComplete'),
  },

  usage: { getMetrics: _fwd('usage:getMetrics') },

  config: {
    save:        _pack('config:save', ['name', 'data']),
    load:        _fwd('config:load'),
    list:        _fwd('config:list'),
    delete:      _fwd('config:delete'),
    setDefault:  _fwd('config:setDefault'),
    getDefault:  _fwd('config:getDefault'),
    loadDefault: _fwd('config:loadDefault'),
  },
});
