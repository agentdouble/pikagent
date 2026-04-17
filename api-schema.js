/**
 * Declarative API schema shared between preload (client-side builders)
 * and main process (handler registration).
 *
 * Each entry describes how a renderer method maps to an IPC channel.
 *
 * Types:
 *   'fwd'     — single-arg ipcRenderer.invoke
 *   'pack'    — multi-arg → keyed object → ipcRenderer.invoke
 *   'on'      — ipcRenderer.on listener (returns unsubscribe)
 *   'custom'  — handler provided at build time (not in schema)
 *
 * Channel convention: `${domain}:${method}` unless `channel` is explicit.
 */

const API_SCHEMA = {
  pty: {
    create:      { type: 'fwd' },
    write:       { type: 'pack', keys: ['id', 'data'] },
    resize:      { type: 'pack', keys: ['id', 'cols', 'rows'] },
    kill:        { type: 'pack', keys: ['id'] },
    getCwd:      { type: 'pack', keys: ['id'], channel: 'pty:getcwd' },
    checkAgents: { type: 'fwd' },
    // onData + onExit are custom (targeted channels), injected at build time
  },
  fs: {
    readdir:   { type: 'fwd' },
    readfile:  { type: 'fwd' },
    mkdir:     { type: 'fwd' },
    homedir:   { type: 'fwd' },
    copy:      { type: 'fwd' },
    trash:     { type: 'fwd' },
    writefile: { type: 'pack', keys: ['filePath', 'content'] },
    rename:    { type: 'pack', keys: ['oldPath', 'newName'] },
    copyTo:    { type: 'pack', keys: ['srcPath', 'destDir'] },
    watch:     { type: 'pack', keys: ['id', 'dirPath'] },
    unwatch:   { type: 'pack', keys: ['id'] },
    onChanged: { type: 'on', channel: 'fs:changed' },
  },
  shell: {
    showInFolder: { type: 'fwd' },
    openExternal: { type: 'fwd' },
    openPath:     { type: 'fwd' },
  },
  clipboard: {
    write: { type: 'fwd' },
  },
  dialog: {
    openFolder: { type: 'fwd' },
  },
  git: {
    branch:       { type: 'fwd' },
    localChanges: { type: 'fwd' },
    fileDiff:     { type: 'pack', keys: ['cwd', 'filePath', 'isStaged'] },
  },
  flow: {
    save:           { type: 'fwd' },
    get:            { type: 'fwd' },
    list:           { type: 'fwd' },
    delete:         { type: 'fwd' },
    toggle:         { type: 'fwd' },
    runNow:         { type: 'fwd' },
    getRunning:     { type: 'fwd' },
    getRunLog:      { type: 'pack', keys: ['flowId', 'logTimestamp'] },
    getCategories:  { type: 'fwd' },
    saveCategories: { type: 'fwd' },
    onRunStarted:   { type: 'on', channel: 'flow:runStarted' },
    onRunComplete:  { type: 'on', channel: 'flow:runComplete' },
  },
  usage: {
    getMetrics: { type: 'fwd' },
  },
  config: {
    save:        { type: 'pack', keys: ['name', 'data'] },
    load:        { type: 'fwd' },
    list:        { type: 'fwd' },
    delete:      { type: 'fwd' },
    setDefault:  { type: 'fwd' },
    getDefault:  { type: 'fwd' },
    loadDefault: { type: 'fwd' },
  },
};

module.exports = { API_SCHEMA };
