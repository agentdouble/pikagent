const { contextBridge } = require('electron');
const { _onIpc, _fwd, _pack, _createTargetedChannel } = require('./preload-helpers');

// --- Targeted PTY dispatch (one listener per event, routed by terminal ID) ---

const _onPtyData = _createTargetedChannel('pty:data', ({ id, data }) => ({ id, value: data }));
const _onPtyExit = _createTargetedChannel('pty:exit', ({ id, exitCode }) => ({ id, value: { id, exitCode } }));

// --- API builder functions ---

function buildTerminalApi() {
  return {
    pty: {
      create:      _fwd('pty:create'),
      write:       _fwd('pty:write'),
      resize:      _fwd('pty:resize'),
      kill:        _fwd('pty:kill'),
      getCwd:      _fwd('pty:getcwd'),
      checkAgents: _fwd('pty:checkAgents'),
      onData:      _onPtyData,
      onExit:      _onPtyExit,
    },
  };
}

function buildFileApi() {
  return {
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
  };
}

function buildGitApi() {
  return {
    git: {
      branch:       _fwd('git:branch'),
      remote:       _fwd('git:remote'),
      localChanges: _fwd('git:localChanges'),
      fileDiff:     _pack('git:fileDiff', ['cwd', 'filePath', 'isStaged']),
    },
  };
}

function buildFlowApi() {
  return {
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
  };
}

function buildConfigApi() {
  return {
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
  };
}

// --- Exposed API ---

contextBridge.exposeInMainWorld('api', {
  ...buildTerminalApi(),
  ...buildFileApi(),
  ...buildGitApi(),
  ...buildFlowApi(),
  ...buildConfigApi(),
});
