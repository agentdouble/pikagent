const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

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
// Helpers
// ---------------------------------------------------------------------------

/** Wrap an async function — returns { error } on failure instead of throwing. */
async function _safeAsync(fn) {
  try {
    return await fn();
  } catch (err) {
    return { error: err.message };
  }
}

async function _pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function _findUniqueCopyPath(dir, name, isDirectory) {
  const ext = isDirectory ? '' : path.extname(name);
  const base = path.basename(name, ext);
  let i = 1;
  while (true) {
    const suffix = i === 1 ? ' (copy)' : ` (copy ${i})`;
    const candidate = path.join(dir, `${base}${suffix}${ext}`);
    if (!(await _pathExists(candidate))) return candidate;
    i++;
  }
}

/**
 * Copy srcPath into destDir. When alwaysUnique is true, always generates
 * a "(copy)" suffix; otherwise only adds one on name collision.
 */
async function _doCopy(srcPath, destDir, alwaysUnique) {
  const stat = await fsp.stat(srcPath);
  const isDir = stat.isDirectory();
  const name = path.basename(srcPath);
  let destPath = path.join(destDir, name);

  if (alwaysUnique || (await _pathExists(destPath))) {
    destPath = await _findUniqueCopyPath(destDir, name, isDir);
  }

  await fsp.cp(srcPath, destPath, { recursive: true });
  return destPath;
}

/** Sort comparator: directories first, then alphabetical. */
function _dirFirstCompare(a, b) {
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  return a.name.localeCompare(b.name);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function readDirectory(dirPath) {
  try {
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    return entries.sort(_dirFirstCompare).map((e) => ({
      name: e.name,
      path: path.join(dirPath, e.name),
      isDirectory: e.isDirectory(),
    }));
  } catch {
    return [];
  }
}

async function readFile(filePath) {
  return _safeAsync(async () => {
    const stat = await fsp.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) return { error: 'File too large (>2MB)' };
    const content = await fsp.readFile(filePath, 'utf-8');
    return { content, size: stat.size };
  });
}

async function writeFile(filePath, content) {
  return _safeAsync(async () => {
    await fsp.writeFile(filePath, content, 'utf-8');
    return { success: true };
  });
}

async function makeDir(dirPath) {
  return _safeAsync(async () => {
    await fsp.mkdir(dirPath, { recursive: true });
    return { success: true };
  });
}

async function copyEntry(srcPath) {
  return _safeAsync(async () => {
    const destPath = await _doCopy(srcPath, path.dirname(srcPath), true);
    return { success: true, destPath };
  });
}

async function copyFileTo(srcPath, destDir) {
  return _safeAsync(async () => {
    const destPath = await _doCopy(srcPath, destDir, false);
    return { success: true, destPath };
  });
}

async function renameEntry(oldPath, newName) {
  return _safeAsync(async () => {
    const newPath = path.join(path.dirname(oldPath), newName);
    await fsp.rename(oldPath, newPath);
    return { success: true, newPath };
  });
}

function getHomedir() {
  return os.homedir();
}

module.exports = { readDirectory, readFile, writeFile, makeDir, copyEntry, copyFileTo, renameEntry, getHomedir, watchDir, unwatchDir, unwatchAll };
