const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

// --- File Watcher ---
const watchers = new Map(); // id -> FSWatcher

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
  for (const [id, w] of watchers) {
    w.close();
  }
  watchers.clear();
}

async function readDirectory(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter((e) => !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      })
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
      }));
  } catch {
    return [];
  }
}

async function readFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    if (stat.size > MAX_FILE_SIZE) {
      return { error: 'File too large (>2MB)' };
    }
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return { content, size: stat.size };
  } catch (err) {
    return { error: err.message };
  }
}

async function writeFile(filePath, content) {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

async function makeDir(dirPath) {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

function getHomedir() {
  return os.homedir();
}

module.exports = { readDirectory, readFile, writeFile, makeDir, getHomedir, watchDir, unwatchDir, unwatchAll };
