/**
 * FileViewer editor rendering helpers — extracted from FileViewer component.
 *
 * Handles the render() shell, editor rendering (code/markdown), status bar,
 * line numbers, and file close logic.  State is passed in, never owned here.
 */

import { _el } from './file-dom.js';
import { EMPTY_MESSAGE, MODE_CONFIG, ALL_STATIC_ELEMENTS, MODE_ACTIVATE } from './editor-helpers.js';
import { pinnedFiles } from './editor-helpers.js';
import {
  updateLineNumbers as doUpdateLineNumbers,
  updateHighlight as doUpdateHighlight,
  updateStatusBar as doUpdateStatusBar,
  saveFile as doSaveFile,
  initCodeEditor,
  createMarkdownPreviewDOM, updatePreviewStatusBar,
  renderTabs as doRenderTabs,
} from './file-viewer-subsystem.js';

/**
 * Build the FileViewer shell DOM inside `container`.
 * @param {HTMLElement} container
 * @param {{ GitChangesView: Function }} components
 * @returns {{ modeBar: HTMLElement, tabsBar: HTMLElement, breadcrumb: HTMLElement, editorWrapper: HTMLElement, gitViewEl: HTMLElement, gitChanges: object, statusBar: HTMLElement }}
 */
export function renderFileViewerShell(container, components) {
  container.replaceChildren();

  const modeBar = _el('div', 'file-viewer-mode-bar');
  container.appendChild(modeBar);

  const tabsBar = _el('div', 'file-viewer-tabs');
  container.appendChild(tabsBar);

  const breadcrumb = _el('div', 'file-viewer-breadcrumb');
  container.appendChild(breadcrumb);

  const editorWrapper = _el('div', 'editor-wrapper');
  container.appendChild(editorWrapper);

  const gitViewEl = _el('div', 'git-changes-view');
  gitViewEl.style.display = 'none';
  container.appendChild(gitViewEl);
  const gitChanges = new components.GitChangesView(gitViewEl);

  const statusBar = _el('div', 'editor-status-bar');
  container.appendChild(statusBar);

  return { modeBar, tabsBar, breadcrumb, editorWrapper, gitViewEl, gitChanges, statusBar };
}

/**
 * Render the active editor content (code, markdown preview, or error).
 * @param {object} fv - FileViewer-like state: { editorWrapper, statusBar, breadcrumb, openFiles, activeFile }
 * @param {{ onUpdate: () => void, onSave: () => void }} callbacks
 * @returns {{ lineNumbers: HTMLElement|null, highlightLayer: HTMLElement|null, editorEl: HTMLElement|null }}
 */
export function renderEditor(fv, callbacks) {
  fv.editorWrapper.replaceChildren();
  fv.statusBar.replaceChildren();

  const file = fv.openFiles.get(fv.activeFile);
  if (!file) {
    showEmpty(fv.editorWrapper, fv.statusBar);
    return { lineNumbers: null, highlightLayer: null, editorEl: null, isEmpty: true };
  }

  fv.breadcrumb.textContent = fv.activeFile;

  if (file.error) {
    fv.editorWrapper.replaceChildren(_el('div', 'file-viewer-error', file.error));
    return { lineNumbers: null, highlightLayer: null, editorEl: null };
  }

  if (file.lang === 'markdown' && file.viewMode === 'preview') {
    createMarkdownPreviewDOM(fv.editorWrapper, file);
    updatePreviewStatusBar(fv.statusBar, file);
    return { lineNumbers: null, highlightLayer: null, editorEl: null };
  }

  const result = initCodeEditor(fv.editorWrapper, file, callbacks);
  doUpdateStatusBar(fv.statusBar, result.editorEl, file);
  result.editorEl.focus();
  return result;
}

/**
 * Show the empty state.
 */
export function showEmpty(editorWrapper, statusBar) {
  editorWrapper.replaceChildren(_el('div', 'file-viewer-empty', EMPTY_MESSAGE));
  statusBar.replaceChildren();
}

/**
 * Update line numbers.
 */
export function updateLineNumbers(lineNumbers, editorEl) {
  doUpdateLineNumbers(lineNumbers, editorEl);
}

/**
 * Update syntax highlight layer.
 */
export function updateHighlight(highlightLayer, editorEl, openFiles, activeFile) {
  const file = openFiles.get(activeFile);
  if (!file) return;
  doUpdateHighlight(highlightLayer, editorEl, file.lang);
}

/**
 * Update status bar.
 */
export function updateStatusBar(statusBar, editorEl, openFiles, activeFile) {
  if (!statusBar || !editorEl) return;
  const file = openFiles.get(activeFile);
  if (!file) { statusBar.replaceChildren(); return; }
  doUpdateStatusBar(statusBar, editorEl, file);
}

/**
 * Save the active file.
 */
export async function saveActive(openFiles, activeFile, statusBar, callbacks, fsWritefile) {
  const file = openFiles.get(activeFile);
  await doSaveFile(activeFile, file, statusBar, callbacks, { writefile: fsWritefile });
}

/**
 * Set mode visibility on FileViewer DOM elements.
 */
export function setModeVisibility(fv, mode, webviewMgr) {
  const visible = new Set(MODE_CONFIG[mode]?.elements || []);
  for (const key of ALL_STATIC_ELEMENTS) {
    fv[key].style.display = visible.has(key) ? '' : 'none';
  }
  webviewMgr.setModeVisibility(mode);
}

/**
 * Switch mode helper.
 */
export function switchMode(fv, mode, webviewMgr, renderModeBar) {
  fv.mode = mode;
  setModeVisibility(fv, mode, webviewMgr);
  renderModeBar();
  MODE_ACTIVATE[mode]?.(fv);
}

/**
 * Render file tabs bar.
 * @param {object} fv - FileViewer instance (for callbacks)
 */
export function renderTabs(fv) {
  doRenderTabs(fv.tabsBar, fv.openFiles, fv.activeFile,
    (p) => fv.isPinned(p), (p) => fv.isModified(p),
    { onClose: (p) => fv.closeFile(p), onActivate: (p) => fv.setActiveTab(p), onTogglePin: (p) => fv.togglePin(p), isMarkdown: (p) => fv.isMarkdown(p), getViewMode: (p) => fv.openFiles.get(p)?.viewMode, onToggleViewMode: (p) => fv.toggleViewMode(p) },
  );
}

/**
 * Load pinned files.
 */
export async function loadPinnedFiles(fv) {
  for (const [path, info] of pinnedFiles) {
    if (!fv.openFiles.has(path)) await fv.openFile(path, info.name);
  }
}
