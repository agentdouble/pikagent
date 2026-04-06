/**
 * Context menu builders for the file tree.
 * Extracted from FileTree to reduce component size.
 */
import { bus } from './events.js';
import { contextMenu } from './context-menu.js';
import { getRelativePath } from './file-tree-helpers.js';

/**
 * Build the common context menu items shared between files and directories.
 * @param {string} entryPath
 * @param {HTMLElement} nameEl - the name span for inline rename
 * @param {string} rootCwd - workspace root for relative path
 * @param {function} promptRenameFn - (entryPath, nameEl) => void
 * @param {string} [deleteLabel] - custom delete confirmation text
 * @returns {Array} menu items
 */
export function buildCommonContextItems(entryPath, nameEl, rootCwd, promptRenameFn, deleteLabel) {
  const displayName = entryPath.split('/').pop();
  return [
    { label: 'Rename', action: () => promptRenameFn(entryPath, nameEl) },
    { separator: true },
    { label: 'Copy Path', action: () => window.api.clipboard.write(entryPath) },
    { label: 'Copy Relative Path', action: () => window.api.clipboard.write(getRelativePath(entryPath, rootCwd)) },
    { separator: true },
    { label: 'Duplicate', action: () => window.api.fs.copy(entryPath) },
    { label: 'Reveal in Finder', action: () => window.api.shell.showInFolder(entryPath) },
    { separator: true },
    {
      label: 'Delete',
      action: () => {
        if (confirm(deleteLabel || `Delete "${displayName}"?`)) {
          window.api.fs.trash(entryPath);
        }
      },
    },
  ];
}

/**
 * Show a file context menu.
 */
export function showFileContextMenu(x, y, entryPath, nameEl, rootCwd, promptRenameFn) {
  contextMenu.show(x, y, buildCommonContextItems(entryPath, nameEl, rootCwd, promptRenameFn));
}

/**
 * Show a directory context menu with additional directory-specific items.
 */
export function showDirContextMenu(x, y, dirPath, rootCwd, contentEl, depth, expandedDirs, nameEl, promptRenameFn, promptNewEntryFn) {
  const dirName = dirPath.split('/').pop();
  contextMenu.show(x, y, [
    { label: 'New File', action: () => promptNewEntryFn(dirPath, contentEl, depth, expandedDirs, 'file') },
    { label: 'New Folder', action: () => promptNewEntryFn(dirPath, contentEl, depth, expandedDirs, 'folder') },
    { separator: true },
    { label: 'Open as Workspace', action: () => bus.emit('workspace:openFromFolder', { cwd: dirPath }) },
    { separator: true },
    ...buildCommonContextItems(dirPath, nameEl, rootCwd, promptRenameFn, `Delete folder "${dirName}" and all its contents?`),
  ]);
}
