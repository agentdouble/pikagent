/**
 * File Tree Subsystem Facade — single entry-point for file-tree utilities.
 *
 * Reduces coupling by providing a single import point for file-tree-context-menu,
 * file-tree-drop, file-tree-helpers, file-tree-renderer, and file-tree-watcher.
 *
 * Kept as-is per issue #462 — 3 active consumers (file-tree.js,
 * file-tree-dir-ops.js, file-tree-section-dom.js) rely on this facade
 * as their single import point for 5 source modules.
 *
 * @module file-tree-subsystem
 * @see https://github.com/agentdouble/pikagent/issues/462
 */

export {
  buildDirContextItems,
} from './file-tree-context-menu.js';

export {
  setupDropZone,
  handleFileDrop,
  promptRename,
  promptNewEntry,
} from './file-tree-drop.js';

export {
  CHEVRON_EXPANDED,
  CHEVRON_COLLAPSED,
  extractFolderName,
  resolveWatchCwd,
} from './file-tree-helpers.js';

export {
  renderDirEntry,
  renderFileEntry,
  buildSectionActions,
} from './file-tree-renderer.js';

export {
  listenForChanges,
  startWatch,
  stopWatch,
} from './file-tree-watcher.js';
