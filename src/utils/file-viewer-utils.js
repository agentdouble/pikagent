/**
 * Barrel re-export for the file-viewer utility family.
 *
 * These modules were extracted from FileViewer to reduce component size.
 * FileViewer is the sole consumer — this barrel keeps its import block compact.
 */

export { renderModeBar } from './file-viewer-mode-bar.js';
export { setupFileViewerListeners } from './file-viewer-listeners.js';
export {
  openFileEntry, isModified, isPinned, togglePin, isMarkdown, closeFileEntry,
  applyRequestedViewMode, resolveInitialViewMode,
} from './file-viewer-files.js';
export {
  renderFileViewerShell, renderEditor, showEmpty,
  updateLineNumbers, updateHighlight, updateStatusBar,
  saveActive, switchMode, renderTabs, loadPinnedFiles,
} from './file-viewer-editor.js';
