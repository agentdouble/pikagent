const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { MAX_FILE_SIZE, createSafeHandler, doCopy, dirFirstCompare } = require('./fs-manager-helpers');

// ---------------------------------------------------------------------------
// File Watcher
// ---------------------------------------------------------------------------

const watchers = new Map();

function watchDir(id, dirPath, callback) {
  unwatchDir(id);
  try {
    const watcher = fs.watch(dirPath, { recursive: true }, (eventType, filename) => {
      callback({ id, dirPath, eventType, filename });
    });
    watcher.on('error', () => unwatchDir(id));
    watchers.set(id, watcher);
  } catch {}
}

function unwatchDir(id) {
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

async function readDirectory(dirPath) {
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

const readFile = createSafeHandler(async (filePath) => {
  const stat = await fsp.stat(filePath);
  if (stat.size > MAX_FILE_SIZE) return { error: 'File too large (>2MB)' };
  const content = await fsp.readFile(filePath, 'utf-8');
  return { content, size: stat.size };
});

const writeFile = createSafeHandler(async (filePath, content) => {
  await fsp.writeFile(filePath, content, 'utf-8');
  return { success: true };
});

const makeDir = createSafeHandler(async (dirPath) => {
  await fsp.mkdir(dirPath, { recursive: true });
  return { success: true };
});

const copyEntry = createSafeHandler(async (srcPath) => {
  const destPath = await doCopy(srcPath, path.dirname(srcPath), true);
  return { success: true, destPath };
});

const copyFileTo = createSafeHandler(async (srcPath, destDir) => {
  const destPath = await doCopy(srcPath, destDir, false);
  return { success: true, destPath };
});

const renameEntry = createSafeHandler(async (oldPath, newName) => {
  const newPath = path.join(path.dirname(oldPath), newName);
  await fsp.rename(oldPath, newPath);
  return { success: true, newPath };
});

function getHomedir() {
  return os.homedir();
}

function cleanup() {
  unwatchAll();
}

module.exports = {
  // Method aliases matching channel suffixes (fs:readdir → readdir, etc.)
  readdir: readDirectory,
  readfile: readFile,
  writefile: writeFile,
  mkdir: makeDir,
  copy: copyEntry,
  copyTo: copyFileTo,
  rename: renameEntry,
  homedir: getHomedir,
  unwatch: unwatchDir,
  // Original names (used internally and by ipc-handlers.js custom handlers)
  readDirectory, readFile, writeFile, makeDir, copyFileTo,
  getHomedir, watchDir, unwatchDir, cleanup,
};
