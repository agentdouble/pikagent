const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { MAX_FILE_SIZE, safeAsync, doCopy, dirFirstCompare } = require('./fs-manager-helpers');

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

async function readFile(filePath) {
  return safeAsync(async () => {
    const stat = await fsp.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) return { error: 'File too large (>2MB)' };
    const content = await fsp.readFile(filePath, 'utf-8');
    return { content, size: stat.size };
  });
}

async function writeFile(filePath, content) {
  return safeAsync(async () => {
    await fsp.writeFile(filePath, content, 'utf-8');
    return { success: true };
  });
}

async function makeDir(dirPath) {
  return safeAsync(async () => {
    await fsp.mkdir(dirPath, { recursive: true });
    return { success: true };
  });
}

async function copyEntry(srcPath) {
  return safeAsync(async () => {
    const destPath = await doCopy(srcPath, path.dirname(srcPath), true);
    return { success: true, destPath };
  });
}

async function copyFileTo(srcPath, destDir) {
  return safeAsync(async () => {
    const destPath = await doCopy(srcPath, destDir, false);
    return { success: true, destPath };
  });
}

async function renameEntry(oldPath, newName) {
  return safeAsync(async () => {
    const newPath = path.join(path.dirname(oldPath), newName);
    await fsp.rename(oldPath, newPath);
    return { success: true, newPath };
  });
}

function getHomedir() {
  return os.homedir();
}

module.exports = { readDirectory, readFile, writeFile, makeDir, copyEntry, copyFileTo, renameEntry, getHomedir, watchDir, unwatchDir, unwatchAll };
