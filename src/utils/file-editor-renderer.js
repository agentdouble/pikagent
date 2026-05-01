/**
 * DOM construction and event binding helpers for the FileViewer editor mode.
 * Extracted from file-viewer.js to reduce component size.
 */

import { _el } from './file-dom.js';
import { getCursorPosition, insertTab, SAVE_FLASH_MS, TAB_SPACES } from './editor-helpers.js';

/**
 * Build the line-numbers, highlight layer, and textarea DOM elements,
 * appending them into `editorWrapper`.
 * Returns { lineNumbers, highlightLayer, editorEl }.
 *
 * @param {HTMLElement} editorWrapper
 * @param {{ content: string }} file
 * @returns {{ lineNumbers: HTMLElement, highlightLayer: HTMLElement, editorEl: HTMLTextAreaElement }}
 */
export function createEditorDOM(editorWrapper, file) {
  const lineNumbers = _el('div', 'editor-line-numbers');
  const highlightLayer = _el('pre', 'editor-highlight-layer');

  const editorEl = _el('textarea', 'editor-textarea');
  editorEl.value = file.content;
  editorEl.spellcheck = false;
  editorEl.setAttribute('autocorrect', 'off');
  editorEl.setAttribute('autocapitalize', 'off');

  const editArea = _el('div', 'editor-edit-area');
  editArea.append(highlightLayer, editorEl);
  editorWrapper.append(lineNumbers, editArea);

  return { lineNumbers, highlightLayer, editorEl };
}

/**
 * Bind input, scroll, and keydown events to the editor textarea.
 *
 * @param {HTMLTextAreaElement} editorEl
 * @param {HTMLElement} lineNumbers
 * @param {HTMLElement} highlightLayer
 * @param {{ content: string }} file - mutable file object (content is updated on input)
 * @param {{ onUpdate: () => void, onSave: () => void }} callbacks
 */
export function bindEditorEvents(editorEl, lineNumbers, highlightLayer, file, { onUpdate, onSave }) {
  editorEl.addEventListener('input', () => {
    file.content = editorEl.value;
    onUpdate();
  });

  editorEl.addEventListener('scroll', () => {
    lineNumbers.scrollTop = editorEl.scrollTop;
    highlightLayer.scrollTop = editorEl.scrollTop;
    highlightLayer.scrollLeft = editorEl.scrollLeft;
  });

  editorEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      e.stopPropagation();
      onSave();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const result = insertTab(editorEl.value, editorEl.selectionStart, editorEl.selectionEnd, TAB_SPACES);
      editorEl.value = result.text;
      editorEl.selectionStart = editorEl.selectionEnd = result.cursorPos;
      editorEl.dispatchEvent(new Event('input'));
    }
  });
}

/**
 * Rebuild the line-numbers element from current editor content.
 *
 * @param {HTMLElement} lineNumbers
 * @param {HTMLTextAreaElement} editorEl
 */
export function updateLineNumbers(lineNumbers, editorEl) {
  if (!lineNumbers || !editorEl) return;
  const count = editorEl.value.split('\n').length;
  const frag = document.createDocumentFragment();
  for (let i = 1; i <= count; i++) {
    if (i > 1) frag.appendChild(document.createTextNode('\n'));
    frag.appendChild(_el('span', null, String(i)));
  }
  lineNumbers.replaceChildren(frag);
}

/**
 * Rebuild the syntax-highlight layer from current editor content.
 *
 * @param {HTMLElement} highlightLayer
 * @param {HTMLTextAreaElement} editorEl
 * @param {string} lang - highlight.js language identifier
 */
export function updateHighlight(highlightLayer, editorEl, lang) {
  if (!highlightLayer || !editorEl) return;
  const code = document.createElement('code');
  code.className = `language-${lang}`;
  // Trailing newline keeps pre sizing in sync with textarea
  code.textContent = editorEl.value + '\n';
  highlightLayer.replaceChildren(code);
  if (window.hljs) {
    window.hljs.highlightElement(code);
  }
}

/**
 * Rebuild the status bar from current editor/file state.
 *
 * @param {HTMLElement} statusBar
 * @param {HTMLTextAreaElement} editorEl
 * @param {{ lang: string, content: string, savedContent: string }} file
 */
export function updateStatusBar(statusBar, editorEl, file) {
  if (!statusBar || !editorEl || !file) return;
  const { line, col, totalLines } = getCursorPosition(editorEl.value, editorEl.selectionStart);
  const modified = file.content !== file.savedContent;
  statusBar.replaceChildren(
    _el('span', 'status-item', file.lang),
    _el('span', 'status-item', `Ln ${line}, Col ${col}`),
    _el('span', 'status-item', `${totalLines} lines`),
    _el('span', modified ? 'status-item status-modified' : 'status-item status-saved', modified ? 'Modified' : 'Saved'),
    _el('span', 'status-save-hint', modified ? '\u2318S to save' : ''),
  );
}

/**
 * Persist the active file to disk and flash the status bar.
 * Mutates file.savedContent on success.
 *
 * @param {string} filePath
 * @param {{ content: string, savedContent: string, error?: string }} file
 * @param {HTMLElement} statusBar
 * @param {{ onSuccess: () => void }} callbacks
 * @param {{ writefile: (path: string, content: string) => Promise<{ error?: string }> }} api - injected API methods
 */
/**
 * Create the code editor DOM, bind events, and run initial updates.
 * Returns { lineNumbers, highlightLayer, editorEl }.
 *
 * @param {HTMLElement} editorWrapper
 * @param {{ content: string, lang: string }} file
 * @param {{ onUpdate: () => void, onSave: () => void }} callbacks
 * @returns {{ lineNumbers: HTMLElement, highlightLayer: HTMLElement, editorEl: HTMLTextAreaElement }}
 */
export function initCodeEditor(editorWrapper, file, { onUpdate, onSave }) {
  const { lineNumbers, highlightLayer, editorEl } = createEditorDOM(editorWrapper, file);

  bindEditorEvents(editorEl, lineNumbers, highlightLayer, file, {
    onUpdate,
    onSave,
  });
  updateLineNumbers(lineNumbers, editorEl);
  updateHighlight(highlightLayer, editorEl, file.lang);

  return { lineNumbers, highlightLayer, editorEl };
}

export async function saveFile(filePath, file, statusBar, { onSuccess }, { writefile }) {
  if (!file || file.error) return;
  const result = await writefile(filePath, file.content);
  if (result.error) {
    statusBar.replaceChildren(_el('span', 'status-item status-error', `Save failed: ${result.error}`));
    return;
  }
  file.savedContent = file.content;
  onSuccess();
  statusBar.classList.add('save-flash');
  setTimeout(() => statusBar.classList.remove('save-flash'), SAVE_FLASH_MS);
}
