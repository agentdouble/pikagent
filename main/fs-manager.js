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

async function copyEntry(srcPath) {
  const stat = await fs.promises.stat(srcPath);
  const dir = path.dirname(srcPath);
  const ext = path.extname(srcPath);
  const base = path.basename(srcPath, ext);

  // Find a unique name: "file (copy).txt", "file (copy 2).txt", etc.
  let destPath;
  let i = 1;
  while (true) {
    const suffix = i === 1 ? ' (copy)' : ` (copy ${i})`;
    const newName = stat.isDirectory() ? `${base}${suffix}` : `${base}${suffix}${ext}`;
    destPath = path.join(dir, newName);
    try {
      await fs.promises.access(destPath);
      i++;
    } catch {
      break; // doesn't exist, use this name
    }
  }

  if (stat.isDirectory()) {
    await copyDirRecursive(srcPath, destPath);
  } else {
    await fs.promises.copyFile(srcPath, destPath);
  }
  return { success: true, destPath };
}

async function copyDirRecursive(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcChild = path.join(src, entry.name);
    const destChild = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcChild, destChild);
    } else {
      await fs.promises.copyFile(srcChild, destChild);
    }
  }
}

async function renameEntry(oldPath, newName) {
  try {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);
    await fs.promises.rename(oldPath, newPath);
    return { success: true, newPath };
  } catch (err) {
    return { error: err.message };
  }
}

function getHomedir() {
  return os.homedir();
}

async function copyFileTo(srcPath, destDir) {
  try {
    const name = path.basename(srcPath);
    let destPath = path.join(destDir, name);

    // If destination already exists, find a unique name
    try {
      await fs.promises.access(destPath);
      const ext = path.extname(name);
      const base = path.basename(name, ext);
      let i = 1;
      while (true) {
        const suffix = i === 1 ? ' (copy)' : ` (copy ${i})`;
        destPath = path.join(destDir, `${base}${suffix}${ext}`);
        try {
          await fs.promises.access(destPath);
          i++;
        } catch {
          break;
        }
      }
    } catch {
      // destPath doesn't exist, use as-is
    }

    const stat = await fs.promises.stat(srcPath);
    if (stat.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
    return { success: true, destPath };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { readDirectory, readFile, writeFile, makeDir, copyEntry, copyFileTo, renameEntry, getHomedir, watchDir, unwatchDir, unwatchAll };
