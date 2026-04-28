/**
 * DOM re-exports for the file-tree / file-viewer domain.
 *
 * File-related modules (file-tree-renderer, file-tree-drop,
 * file-editor-renderer, file-viewer-tabs) import _el through this facade
 * instead of reaching into the core dom.js hub directly.
 */
export { _el, createActionButton, renderList } from './dom.js';
