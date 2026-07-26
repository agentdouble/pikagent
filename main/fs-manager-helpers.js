const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { wrapSafe } = require('./safe-handler');

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findUniqueCopyPath(dir, name, isDirectory) {
  const ext = isDirectory ? '' : path.extname(name);
  const base = path.basename(name, ext);
  let i = 1;
  while (true) {
    const suffix = i === 1 ? ' (copy)' : ` (copy ${i})`;
    const candidate = path.join(dir, `${base}${suffix}${ext}`);
    if (!(await pathExists(candidate))) return candidate;
    i++;
  }
}

/**
 * Copy srcPath into destDir. When alwaysUnique is true, always generates
 * a "(copy)" suffix; otherwise only adds one on name collision.
 */
async function doCopy(srcPath, destDir, alwaysUnique) {
  const stat = await fsp.stat(srcPath);
  const isDir = stat.isDirectory();
  const name = path.basename(srcPath);
  let destPath = path.join(destDir, name);

  if (alwaysUnique || (await pathExists(destPath))) {
    destPath = await findUniqueCopyPath(destDir, name, isDir);
  }

  await fsp.cp(srcPath, destPath, { recursive: true });
  return destPath;
}

/** Sort comparator: directories first, then alphabetical. */
function dirFirstCompare(a, b) {
  const aIsDirectory = typeof a.isDirectory === 'function' ? a.isDirectory() : a.isDirectory;
  const bIsDirectory = typeof b.isDirectory === 'function' ? b.isDirectory() : b.isDirectory;
  if (aIsDirectory !== bIsDirectory) return aIsDirectory ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/**
 * Convert a Dirent to the renderer-facing shape. Symbolic links and Windows
 * junctions need a stat call because Dirent.isDirectory() is false for them.
 */
async function describeDirEntry(dirPath, entry, stat = fsp.stat) {
  const entryPath = path.join(dirPath, entry.name);
  let isDirectory = entry.isDirectory();

  if (!isDirectory && entry.isSymbolicLink()) {
    try {
      isDirectory = (await stat(entryPath)).isDirectory();
    } catch {
      // Keep broken or inaccessible links visible as files.
    }
  }

  return { name: entry.name, path: entryPath, isDirectory };
}

module.exports = {
  MAX_FILE_SIZE,
  wrapSafe,
  pathExists,
  doCopy,
  dirFirstCompare,
  describeDirEntry,
};
