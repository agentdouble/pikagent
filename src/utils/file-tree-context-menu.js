/**
 * Context menu builders for the file tree.
 * Extracted from FileTree to reduce component size.
 */
import { bus, EVENTS } from './events.js';
import { getRelativePath } from './file-tree-helpers.js';

/**
 * Build the common context menu items shared between files and directories.
 * @param {string} entryPath
 * @param {HTMLElement} nameEl - the name span for inline rename
 * @param {string} rootCwd - workspace root for relative path
 * @param {(entryPath: string, nameEl: HTMLElement) => void} promptRenameFn
 * @param {string} [deleteLabel] - custom delete confirmation text
 * @param {{ clipboardWrite: (text: string) => void, fsCopy: (path: string) => void, showInFolder: (path: string) => void, fsTrash: (path: string) => void }} api - injected API methods
 * @returns {Array<{ label?: string, separator?: boolean, action?: () => void }>} menu items
 */
export function buildCommonContextItems(entryPath, nameEl, rootCwd, promptRenameFn, deleteLabel, { clipboardWrite, fsCopy, showInFolder, fsTrash }) {
  const displayName = entryPath.split('/').pop();
  return [
    { label: 'Rename', action: () => promptRenameFn(entryPath, nameEl) },
    { separator: true },
    { label: 'Copy Path', action: () => clipboardWrite(entryPath) },
    { label: 'Copy Relative Path', action: () => clipboardWrite(getRelativePath(entryPath, rootCwd)) },
    { separator: true },
    { label: 'Duplicate', action: () => fsCopy(entryPath) },
    { label: 'Reveal in Finder', action: () => showInFolder(entryPath) },
    { separator: true },
    {
      label: 'Delete',
      action: () => {
        if (confirm(deleteLabel || `Delete "${displayName}"?`)) {
          fsTrash(entryPath);
        }
      },
    },
  ];
}

/**
 * Build file context menu items.
 * @param {string} entryPath
 * @param {HTMLElement} nameEl
 * @param {string} rootCwd
 * @param {(entryPath: string, nameEl: HTMLElement) => void} promptRenameFn
 * @param {{ clipboardWrite: (text: string) => void, fsCopy: (path: string) => void, showInFolder: (path: string) => void, fsTrash: (path: string) => void }} api - injected API methods
 * @returns {Array<{ label?: string, separator?: boolean, action?: () => void }>} menu items
 */
export function buildFileContextItems(entryPath, nameEl, rootCwd, promptRenameFn, api) {
  return buildCommonContextItems(entryPath, nameEl, rootCwd, promptRenameFn, undefined, api);
}

/**
 * Build directory context menu items.
 * @param {string} dirPath
 * @param {string} rootCwd
 * @param {HTMLElement} contentEl
 * @param {number} depth
 * @param {Set<string>} expandedDirs
 * @param {HTMLElement} nameEl
 * @param {(entryPath: string, nameEl: HTMLElement) => void} promptRenameFn
 * @param {(dirPath: string, contentEl: HTMLElement, depth: number, expandedDirs: Set<string>, type: 'file'|'folder') => void} promptNewEntryFn
 * @param {{ clipboardWrite: (text: string) => void, fsCopy: (path: string) => void, showInFolder: (path: string) => void, fsTrash: (path: string) => void }} api - injected API methods
 * @returns {Array<{ label?: string, separator?: boolean, action?: () => void }>} menu items
 */
export function buildDirContextItems(dirPath, rootCwd, contentEl, depth, expandedDirs, nameEl, promptRenameFn, promptNewEntryFn, api) {
  const dirName = dirPath.split('/').pop();
  return [
    { label: 'New File', action: () => promptNewEntryFn(dirPath, contentEl, depth, expandedDirs, 'file') },
    { label: 'New Folder', action: () => promptNewEntryFn(dirPath, contentEl, depth, expandedDirs, 'folder') },
    { separator: true },
    { label: 'Open as Workspace', action: () => {
      /** @fires workspace:openFromFolder {{ cwd: string }} */
      bus.emit(EVENTS.WORKSPACE_OPEN_FROM_FOLDER, { cwd: dirPath });
    } },
    { label: 'New Worktree…', action: () => {
      /** @fires workspace:createWorktree {{ repoCwd: string }} */
      bus.emit(EVENTS.WORKSPACE_CREATE_WORKTREE, { repoCwd: dirPath });
    } },
    { separator: true },
    ...buildCommonContextItems(dirPath, nameEl, rootCwd, promptRenameFn, `Delete folder "${dirName}" and all its contents?`, api),
  ];
}
