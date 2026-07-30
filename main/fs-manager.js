const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { MAX_FILE_SIZE, wrapSafe, doCopy, dirFirstCompare } = require('./fs-manager-helpers');
const { createLogger } = require('./logger');
const sshFs = require('./ssh-fs-manager');
const { isSshPath } = require('./ssh-path-utils');

const log = createLogger('fs-manager');

// ---------------------------------------------------------------------------
// File Watcher
// ---------------------------------------------------------------------------

const watchers = new Map();

function watchDir(id, dirPath, callback) {
  unwatch(id);
  if (isSshPath(dirPath)) return;
  try {
    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      callback({ id, dirPath, eventType, filename });
    });
    watcher.on('error', () => unwatch(id));
    watchers.set(id, watcher);
  } catch (err) { log.warn('watchDir failed', dirPath, err); }
}

function unwatch(id) {
  const w = watchers.get(id);
  if (w) {
    w.close();
    watchers.delete(id);
  }
}

function unwatchAll() {
  for (const w of watchers.values()) w.close();
  watchers.clear();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function readdir(dirPath) {
  if (isSshPath(dirPath)) {
    try {
      return await sshFs.readdir(dirPath);
    } catch (err) {
      log.warn('ssh readdir failed', dirPath, err);
      return [];
    }
  }
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.sort(dirFirstCompare).map((e) => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      isDirectory: e.isDirectory(),
    }));
  } catch {
    return [];
  }
}

const readfile = wrapSafe(async (filePath) => {
  if (isSshPath(filePath)) return sshFs.readfile(filePath);
  const stat = await fsp.stat(filePath);
  if (stat.size > MAX_FILE_SIZE) return { error: 'File too large (>2MB)' };
  const content = await fsp.readFile(filePath, 'utf-8');
  return { content, size: stat.size };
});

const writefile = wrapSafe(async (filePath, content) => {
  if (isSshPath(filePath)) return sshFs.writefile(filePath, content);
  await fsp.writeFile(filePath, content, 'utf-8');
  return { success: true };
});

const mkdir = wrapSafe(async (dirPath) => {
  if (isSshPath(dirPath)) return sshFs.mkdir(dirPath);
  await fsp.mkdir(dirPath, { recursive: true });
  return { success: true };
});

const copy = wrapSafe(async (srcPath) => {
  if (isSshPath(srcPath)) return sshFs.copy(srcPath);
  const destPath = await doCopy(srcPath, path.dirname(srcPath), true);
  return { success: true, destPath };
});

const copyTo = wrapSafe(async (srcPath, destDir) => {
  if (isSshPath(destDir)) return sshFs.copyTo(srcPath, destDir);
  const destPath = await doCopy(srcPath, destDir, false);
  return { success: true, destPath };
});

const rename = wrapSafe(async (oldPath, newName) => {
  if (isSshPath(oldPath)) return sshFs.rename(oldPath, newName);
  const newPath = path.join(path.dirname(oldPath), newName);
  await fsp.rename(oldPath, newPath);
  return { success: true, newPath };
});

function homedir() {
  return os.homedir();
}

function cleanup() {
  unwatchAll();
}

module.exports = {
  readdir, readfile, writefile, mkdir,
  copy, copyTo, rename, homedir, unwatch,
  // Used directly by ipc-handlers.js (custom fs:watch handler) and manager-init.js (cleanup)
  watchDir, cleanup,
};
