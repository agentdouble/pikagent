const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // PTY
  pty: {
    create: (opts) => ipcRenderer.invoke('pty:create', opts),
    write: (opts) => ipcRenderer.invoke('pty:write', opts),
    resize: (opts) => ipcRenderer.invoke('pty:resize', opts),
    kill: (opts) => ipcRenderer.invoke('pty:kill', opts),
    getCwd: (opts) => ipcRenderer.invoke('pty:getcwd', opts),
    onData: (cb) => {
      const listener = (event, payload) => cb(payload);
      ipcRenderer.on('pty:data', listener);
      return () => ipcRenderer.removeListener('pty:data', listener);
    },
    onExit: (cb) => {
      const listener = (event, payload) => cb(payload);
      ipcRenderer.on('pty:exit', listener);
      return () => ipcRenderer.removeListener('pty:exit', listener);
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
    watch: (id, dirPath) => ipcRenderer.invoke('fs:watch', { id, dirPath }),
    unwatch: (id) => ipcRenderer.invoke('fs:unwatch', { id }),
    onChanged: (cb) => {
      const listener = (event, payload) => cb(payload);
      ipcRenderer.on('fs:changed', listener);
      return () => ipcRenderer.removeListener('fs:changed', listener);
    },
  },

  // Shell / Clipboard
  shell: {
    showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
  },
  clipboard: {
    write: (text) => ipcRenderer.invoke('clipboard:write', text),
  },

  // Git
  git: {
    branch: (cwd) => ipcRenderer.invoke('git:branch', cwd),
    remote: (cwd) => ipcRenderer.invoke('git:remote', cwd),
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
