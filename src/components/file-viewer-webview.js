/**
 * Webview tab management for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */
import { onClickStopped } from '../utils/event-helpers.js';
import { _el } from '../utils/file-dom.js';
import { setupInlineInput } from '../utils/form-helpers.js';
import { generateId } from '../utils/id.js';
import { emitLayoutChanged } from '../utils/workspace-events.js';
import { parseWebviewUrl } from '../utils/editor-helpers.js';
import { registerComponent, getComponent } from '../utils/component-registry.js';

export class WebviewManager {
  /**
   * @param {HTMLElement} container - the file-viewer container element
   * @param {HTMLElement} statusBar - the status bar element (webview containers insert before it)
   * @param {(modeId: string) => void} switchModeFn - callback to switch the viewer mode
   * @param {() => void} renderModeBarFn - callback to re-render the mode bar
   */
  constructor(container, statusBar, switchModeFn, renderModeBarFn) {
    this._container = container;
    this._statusBar = statusBar;
    this._switchMode = switchModeFn;
    this._renderModeBar = renderModeBarFn;
    this.webviewTabs = [];         // [{ id, label, url }]
    this._webviewEls = new Map();  // id -> { container, instance }
  }

  addWebview(label, url) {
    const wt = { id: generateId('wv'), label, url };
    this.webviewTabs.push(wt);
    this._createWebviewContainer(wt);
    this._switchMode(wt.id);
    /** @fires layout:changed {undefined} — webview added */
    emitLayoutChanged();
  }

  removeWebview(webviewId) {
    const idx = this.webviewTabs.findIndex(wt => wt.id === webviewId);
    if (idx < 0) return;
    this.webviewTabs.splice(idx, 1);

    const wvData = this._webviewEls.get(webviewId);
    if (wvData) {
      if (wvData.instance) wvData.instance.dispose();
      wvData.container.remove();
      this._webviewEls.delete(webviewId);
    }

    return webviewId; // Return so caller knows which was removed
  }

  _createWebviewContainer(wt) {
    const container = _el('div', 'webview-area');
    container.style.display = 'none';
    this._container.insertBefore(container, this._statusBar);
    const WebviewInstance = getComponent('WebviewInstance');
    const instance = new WebviewInstance(container, wt.url);
    this._webviewEls.set(wt.id, { container, instance });
  }

  getWebviewTabs() {
    return this.webviewTabs.map(wt => ({ label: wt.label, url: wt.url }));
  }

  setWebviewTabs(tabs) {
    if (!tabs || !tabs.length) return;
    for (const t of tabs) {
      const wt = { id: generateId('wv'), label: t.label, url: t.url };
      this.webviewTabs.push(wt);
      this._createWebviewContainer(wt);
    }
    this._renderModeBar();
  }

  /** Update visibility of all webview containers for the current mode. */
  setModeVisibility(activeMode) {
    for (const [id, wvData] of this._webviewEls) {
      wvData.container.style.display = activeMode === id ? '' : 'none';
    }
  }

  // --- Mode bar button builders ---

  buildWebviewModeBtn(wt, currentMode) {
    const btn = _el('button', `mode-btn mode-btn-webview${currentMode === wt.id ? ' active' : ''}`);
    btn.appendChild(_el('span', null, wt.label));
    const closeBtn = _el('span', 'mode-btn-close', { textContent: '\u00d7' });
    onClickStopped(closeBtn, () => {
      const removedId = this.removeWebview(wt.id);
      if (currentMode === removedId) this._switchMode('files');
      else this._renderModeBar();
      /** @fires layout:changed {undefined} — webview removed */
      emitLayoutChanged();
    });
    btn.appendChild(closeBtn);
    btn.addEventListener('click', () => this._switchMode(wt.id));
    return btn;
  }

  buildAddWebviewBtn(modeBar) {
    const btn = _el('button', 'mode-btn mode-btn-add', { textContent: '+', title: 'Add browser preview' });
    btn.addEventListener('click', () => this._showAddWebviewInput(btn, modeBar));
    return btn;
  }

  _showAddWebviewInput(addBtn, modeBar) {
    const input = _el('input', 'mode-bar-url-input');
    input.type = 'text';
    input.placeholder = 'localhost:3000';
    modeBar.replaceChild(input, addBtn);
    input.focus();

    setupInlineInput(input, {
      onCommit: (val) => {
        if (val) {
          const { url, label } = parseWebviewUrl(val);
          this.addWebview(label, url);
        } else {
          this._renderModeBar();
        }
      },
      onCancel: () => this._renderModeBar(),
    });
  }

  dispose() {
    for (const [, wvData] of this._webviewEls) {
      if (wvData.instance) wvData.instance.dispose();
    }
    this._webviewEls.clear();
  }
}

registerComponent('WebviewManager', WebviewManager);
