/**
 * Facade module that re-exports all file-tree-specific utilities.
 * Reduces coupling by providing a single import point for file-tree subsystem.
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
