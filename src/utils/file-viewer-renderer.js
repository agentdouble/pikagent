/**
 * DOM construction and event wiring helpers for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */

import { _el } from './dom.js';
import { subscribeBus, EVENTS } from './events.js';
import { STATIC_MODES, MODE_CONFIG, ALL_STATIC_ELEMENTS } from './editor-helpers.js';

/**
 * Build the main layout for the file viewer: mode bar, tabs bar, breadcrumb,
 * editor wrapper, git view, and status bar.
 *
 * @param {HTMLElement} container
 * @param {{ createGitView: (el: HTMLElement) => unknown }} deps
 * @returns {{ modeBar: HTMLElement, tabsBar: HTMLElement, breadcrumb: HTMLElement, editorWrapper: HTMLElement, gitViewEl: HTMLElement, statusBar: HTMLElement, gitChanges: unknown }}
 */
export function buildFileViewerLayout(container, deps) {
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
  const gitChanges = deps.createGitView(gitViewEl);

  const statusBar = _el('div', 'editor-status-bar');
  container.appendChild(statusBar);

  return { modeBar, tabsBar, breadcrumb, editorWrapper, gitViewEl, statusBar, gitChanges };
}

/**
 * Subscribe to bus events for the file viewer.
 *
 * @param {{ isActive: () => boolean, switchMode: (mode: string) => void, openFile: (path: string, name: string) => void, gitChanges: { setCwd: (cwd: string) => void, loadChanges: () => void }, getMode: () => string, loadPinnedFiles: () => void }} deps
 * @returns {Array<() => void>} subscription handles for cleanup
 */
export function setupFileViewerListeners(deps) {
  return subscribeBus([
    [EVENTS.FILE_OPEN, ({ path, name }) => {
      if (!deps.isActive()) return;
      deps.switchMode('files');
      deps.openFile(path, name);
    }],
    [EVENTS.TERMINAL_CWD_CHANGED, ({ cwd }) => {
      if (!deps.isActive()) return;
      deps.gitChanges.setCwd(cwd);
      if (deps.getMode() === 'git') deps.gitChanges.loadChanges();
    }],
    [EVENTS.WORKSPACE_ACTIVATED, () => {
      if (!deps.isActive()) return;
      deps.loadPinnedFiles();
    }],
  ]);
}

/**
 * Apply mode visibility to static elements and the webview manager.
 *
 * @param {string} mode
 * @param {Record<string, HTMLElement>} elements - keyed by ALL_STATIC_ELEMENTS keys
 * @param {{ setModeVisibility: (mode: string) => void }} webviewMgr
 */
export function setModeVisibility(mode, elements, webviewMgr) {
  const visible = new Set(MODE_CONFIG[mode]?.elements || []);
  for (const key of ALL_STATIC_ELEMENTS) {
    elements[key].style.display = visible.has(key) ? '' : 'none';
  }
  webviewMgr.setModeVisibility(mode);
}

/**
 * Rebuild the mode bar buttons from static modes and webview tabs.
 *
 * @param {HTMLElement} modeBar
 * @param {string} currentMode
 * @param {{ switchMode: (mode: string) => void, webviewMgr: { webviewTabs: Array<unknown>, buildWebviewModeBtn: (wt: unknown, mode: string) => HTMLElement, buildAddWebviewBtn: (modeBar: HTMLElement) => HTMLElement } }} deps
 */
export function renderModeBar(modeBar, currentMode, deps) {
  modeBar.replaceChildren();
  for (const { key, label } of STATIC_MODES) {
    const btn = _el('button', `mode-btn${currentMode === key ? ' active' : ''}`, label);
    btn.addEventListener('click', () => deps.switchMode(key));
    modeBar.appendChild(btn);
  }
  for (const wt of deps.webviewMgr.webviewTabs) {
    modeBar.appendChild(deps.webviewMgr.buildWebviewModeBtn(wt, currentMode));
  }
  modeBar.appendChild(deps.webviewMgr.buildAddWebviewBtn(modeBar));
}
