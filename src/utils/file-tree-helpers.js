/**
 * Pure helpers and constants for file-tree.
 * No DOM — deterministic functions that can be tested in isolation.
 */

const INDENT_BASE = 12;
const INDENT_STEP = 16;
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

/** SVG icon strings for file tree header actions (parsed at load time in the view). */
export const SVG_ICONS = {
  newFile:     '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M11.5 1H4.5C3.67 1 3 1.67 3 2.5v11c0 .83.67 1.5 1.5 1.5h7c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zM7 4h2v2.5h2.5v2H9V11H7V8.5H4.5v-2H7V4z"/></svg>',
  newFolder:   '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14 4H8.72l-1.5-1.5H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-3 5.5h-1.5V11h-1V9.5H7v-1h1.5V7h1v1.5H11v1z"/></svg>',
  newWorktree: '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="8" r="1.5"/><path d="M4 4.5v7"/><path d="M4 8h4.5a2 2 0 0 0 2-2v-.5"/><path d="M11.3 9.2 13 10.9M13 7.1l-1.7 1.7"/></svg>',
  openPr:      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="3.5" r="1.5"/><circle cx="4" cy="12.5" r="1.5"/><circle cx="12" cy="12.5" r="1.5"/><path d="M4 5v6"/><path d="M12 7v4"/><path d="M8 3.5h2.5a1.5 1.5 0 0 1 1.5 1.5v0"/><path d="m10 1.5 2 2-2 2"/></svg>',
  refresh:     '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M13.45 5.17A6 6 0 0 0 2.55 5.17L1 3.62V8h4.38L3.72 6.34a4.5 4.5 0 1 1-.34 4.83l-1.36.78A6 6 0 1 0 13.45 5.17z"/></svg>',
};

/**
 * Declarative table for section header actions — drives the button row via
 * table-driven loop. `action` resolves against an action dispatcher built in
 * the view (FileTree._buildSectionHeader).
 */
export const HEADER_ACTIONS = [
  { key: 'newFile',     title: 'New File',            action: 'newFile'     },
  { key: 'newFolder',   title: 'New Folder',          action: 'newFolder'   },
  { key: 'newWorktree', title: 'New Worktree',        action: 'newWorktree' },
  { key: 'openPr',      title: 'Push & open PR',      action: 'openPr'      },
  { key: 'refresh',     title: 'Refresh',             action: 'refresh'     },
];
