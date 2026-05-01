/**
 * Facade that re-exports rendering-related helpers consumed by FileViewer.
 * Reduces coupling by letting file-viewer.js import from a single module
 * instead of five separate ones.
 *
 * @see https://github.com/user/repo/issues/322
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
