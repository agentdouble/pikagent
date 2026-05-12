/**
 * File Viewer Subsystem Facade — single entry-point for file-viewer.js
 * to access editor rendering, markdown preview, tabs, mode bar, and listeners.
 *
 * Reduces coupling by letting file-viewer.js import from a single module
 * instead of five separate ones (file-editor-renderer, markdown-preview-renderer,
 * file-viewer-tabs, file-viewer-mode-bar, file-viewer-listeners).
 *
 * Kept as-is per issue #462 — 2 active consumers (file-viewer.js,
 * file-viewer-editor.js) rely on this facade as their single import point.
 *
 * @module file-viewer-subsystem
 * @see https://github.com/agentdouble/pikagent/issues/462
 */

export {
  createEditorDOM,
  bindEditorEvents,
  updateLineNumbers,
  updateHighlight,
  updateStatusBar,
  saveFile,
  initCodeEditor,
} from './file-editor-renderer.js';

export {
  createMarkdownPreviewDOM,
  updatePreviewStatusBar,
} from './markdown-preview-renderer.js';

export { renderTabs } from './file-viewer-tabs.js';

export { renderModeBar } from './file-viewer-mode-bar.js';

export { setupFileViewerListeners } from './file-viewer-listeners.js';
