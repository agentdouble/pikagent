const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { runSafe } = require('./safe-handler');

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

/**
 * Factory that wraps an async function with error handling.
 * On success returns the result of fn directly.
 * On failure returns { error: err.message }.
 *
 * @param {(...args: unknown[]) => Promise<unknown>} fn - async function to wrap
 * @returns {(...args: unknown[]) => Promise<unknown>} wrapped function with same signature
 */
function createSafeHandler(fn) {
  return function (...args) {
    return runSafe(() => fn(...args), (err) => ({ error: err.message }));
  };
}

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
  if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
  return a.name.localeCompare(b.name);
}

module.exports = { MAX_FILE_SIZE, createSafeHandler, doCopy, dirFirstCompare };
