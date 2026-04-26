/**
 * DOM construction for the FileViewer markdown-preview mode.
 * Parallel to file-editor-renderer.js but renders parsed markdown HTML
 * instead of an editable textarea.
 */

import { _el } from './file-dom.js';
import { renderMarkdown } from './markdown-renderer.js';

/**
 * Build the markdown preview DOM inside `editorWrapper`.
 * Returns the preview element for later reference.
 *
 * @param {HTMLElement} editorWrapper
 * @param {{ content: string }} file
 * @returns {HTMLElement}
 */
export function createMarkdownPreviewDOM(editorWrapper, file) {
  const preview = _el('div', 'markdown-preview');
  preview.innerHTML = renderMarkdown(file.content || '');
  // External links must open in the system browser (Electron webview context)
  for (const a of preview.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  }
  editorWrapper.replaceChildren(preview);
  return preview;
}

/**
 * Rebuild the status bar for preview mode — simpler than edit mode.
 *
 * @param {HTMLElement} statusBar
 * @param {{ lang: string, content: string }} file
 */
export function updatePreviewStatusBar(statusBar, file) {
  if (!statusBar || !file) return;
  const lines = (file.content || '').split('\n').length;
  statusBar.replaceChildren(
    _el('span', 'status-item', 'markdown'),
    _el('span', 'status-item', 'Preview'),
    _el('span', 'status-item', `${lines} lines`),
    _el('span', 'status-save-hint', 'Right-click tab to edit'),
  );
}
