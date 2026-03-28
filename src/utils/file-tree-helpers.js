/**
 * Pure helpers and constants for file-tree.
 * No DOM — deterministic functions that can be tested in isolation.
 */

export const INDENT_BASE = 12;
export const INDENT_STEP = 16;
export const CHEVRON_EXPANDED = '▾';
export const CHEVRON_COLLAPSED = '▸';
export const DEBOUNCE_DELAY = 400;
export const INPUT_BLUR_DELAY = 100;
export const WATCH_PREFIX = 'watch_';

/**
 * Compute left indent in pixels for a given depth.
 * @param {number} depth
 * @returns {number}
 */
export function computeIndent(depth) {
  return INDENT_BASE + depth * INDENT_STEP;
}

/**
 * Get the relative path from a full path under rootCwd.
 * @param {string} fullPath
 * @param {string} rootCwd
 * @returns {string}
 */
export function getRelativePath(fullPath, rootCwd) {
  if (fullPath.startsWith(rootCwd)) {
    const rel = fullPath.slice(rootCwd.length);
    return rel.startsWith('/') ? rel.slice(1) : rel;
  }
  return fullPath;
}

/**
 * Extract the folder display name from a cwd path.
 * @param {string} cwd
 * @returns {string}
 */
export function extractFolderName(cwd) {
  return cwd.split('/').filter(Boolean).pop() || '/';
}

/**
 * Strip the watch prefix from a watchId to get the original cwd.
 * If the string is not prefixed, returns it unchanged.
 * @param {string} watchIdOrCwd
 * @returns {string}
 */
export function resolveWatchCwd(watchIdOrCwd) {
  return watchIdOrCwd.startsWith(WATCH_PREFIX)
    ? watchIdOrCwd.slice(WATCH_PREFIX.length)
    : watchIdOrCwd;
}
