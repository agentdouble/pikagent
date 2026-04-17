import { detectLanguage } from '../utils/file-icons.js';
import { bus, subscribeBus, unsubscribeBus, EVENTS } from '../utils/events.js';
import { _el } from '../utils/dom-dialogs.js';
import { EMPTY_MESSAGE, STATIC_MODES, MODE_CONFIG, ALL_STATIC_ELEMENTS, MODE_ACTIVATE, pinnedFiles } from '../utils/editor-helpers.js';
import { createEditorDOM, bindEditorEvents, updateLineNumbers, updateHighlight, updateStatusBar, saveFile } from '../utils/file-editor-renderer.js';
import { renderTabs as renderTabsHelper } from '../utils/file-viewer-tabs.js';
import { registerComponent, getComponent } from '../utils/component-registry.js';

export class FileViewer {
  constructor(container, isActive) {
    this.container = container;
    this.isActive = isActive || (() => true);
    this.openFiles = new Map(); // path -> { name, content, savedContent, lang }
    this.activeFile = null;
    this.editorEl = null;
    this.lineNumbers = null;
    this.highlightLayer = null;
    this.mode = 'files'; // 'files' | 'git' | webview id
    this.gitChanges = null;
    this.render();
    const WebviewManager = getComponent('WebviewManager');
    this._webviewMgr = new WebviewManager(
      this.container, this.statusBar,
      (mode) => this.switchMode(mode),
      () => this._renderModeBar(),
    );
    this._setupListeners();
  }

  static get pinnedFiles() { return pinnedFiles; }

  // ===== Build =====

  render() {
    this.container.replaceChildren(_el('div', 'file-viewer-spacer'));

    this.modeBar = _el('div', 'file-viewer-mode-bar');
    this.container.appendChild(this.modeBar);
    this._renderModeBar();

    this.tabsBar = _el('div', 'file-viewer-tabs');
    this.container.appendChild(this.tabsBar);

    this.breadcrumb = _el('div', 'file-viewer-breadcrumb');
    this.container.appendChild(this.breadcrumb);

    this.editorWrapper = _el('div', 'editor-wrapper');
    this.container.appendChild(this.editorWrapper);

    this.gitViewEl = _el('div', 'git-changes-view');
    this.gitViewEl.style.display = 'none';
    this.container.appendChild(this.gitViewEl);
    const GitChangesView = getComponent('GitChangesView');
    this.gitChanges = new GitChangesView(this.gitViewEl);

    this.statusBar = _el('div', 'editor-status-bar');
    this.container.appendChild(this.statusBar);

    this.showEmpty();
  }

  _setupListeners() {
    // Bus event listeners — single declaration drives both subscription and cleanup
    this._busListeners = subscribeBus([
      /** @listens file:open {{ path: string, name: string }} */
      [EVENTS.FILE_OPEN, ({ path, name }) => {
        if (!this.isActive()) return;
        this.switchMode('files');
        this.openFile(path, name);
      }],
      /** @listens terminal:cwdChanged {{ id: string, cwd: string }} */
      [EVENTS.TERMINAL_CWD_CHANGED, ({ cwd }) => {
        if (!this.isActive()) return;
        this.gitChanges.setCwd(cwd);
        if (this.mode === 'git') this.gitChanges.loadChanges();
      }],
      /** @listens workspace:activated {undefined} */
      [EVENTS.WORKSPACE_ACTIVATED, () => {
        if (!this.isActive()) return;
        this.loadPinnedFiles();
      }],
    ]);
  }

  async loadPinnedFiles() {
    for (const [path, info] of pinnedFiles) {
      if (!this.openFiles.has(path)) {
        await this.openFile(path, info.name);
      }
    }
  }

  isPinned(filePath) {
    return pinnedFiles.has(filePath);
  }

  togglePin(filePath) {
    const file = this.openFiles.get(filePath);
    if (!file) return;
    if (pinnedFiles.has(filePath)) {
      pinnedFiles.delete(filePath);
    } else {
      pinnedFiles.set(filePath, { name: file.name });
    }
    this.renderTabs();
  }

  _setModeVisibility(mode) {
    const visible = new Set(MODE_CONFIG[mode]?.elements || []);
    for (const key of ALL_STATIC_ELEMENTS) {
      this[key].style.display = visible.has(key) ? '' : 'none';
    }
    this._webviewMgr.setModeVisibility(mode);
  }

  switchMode(mode) {
    this.mode = mode;
    this._setModeVisibility(mode);
    this._renderModeBar();
    MODE_ACTIVATE[mode]?.(this);
  }

  // ===== Files Mode =====

  async openFile(filePath, fileName) {
    if (this.openFiles.has(filePath)) {
      this.setActiveTab(filePath);
      return;
    }

    const result = await window.api.fs.readfile(filePath);
    if (result.error) {
      this.openFiles.set(filePath, { name: fileName, content: '', savedContent: '', lang: 'plaintext', error: result.error });
    } else {
      const lang = detectLanguage(fileName);
      this.openFiles.set(filePath, { name: fileName, content: result.content, savedContent: result.content, lang, error: null });
    }

    this.setActiveTab(filePath);
  }

  setActiveTab(filePath) {
    this.activeFile = filePath;
    this.renderTabs();
    this.renderEditor();
  }

  isModified(filePath) {
    const file = this.openFiles.get(filePath);
    if (!file) return false;
    return file.content !== file.savedContent;
  }

  renderTabs() {
    renderTabsHelper(this.tabsBar, this.openFiles, this.activeFile,
      (p) => this.isPinned(p),
      (p) => this.isModified(p),
      {
        onClose: (p) => this.closeFile(p),
        onActivate: (p) => this.setActiveTab(p),
        onTogglePin: (p) => this.togglePin(p),
      },
    );
  }

  renderEditor() {
    this.editorWrapper.replaceChildren();
    this.statusBar.replaceChildren();

    const file = this.openFiles.get(this.activeFile);
    if (!file) { this.showEmpty(); return; }

    this.breadcrumb.textContent = this.activeFile;

    if (file.error) {
      this.editorWrapper.replaceChildren(_el('div', 'file-viewer-error', file.error));
      return;
    }

    const { lineNumbers, highlightLayer, editorEl } = createEditorDOM(this.editorWrapper, file);
    this.lineNumbers = lineNumbers;
    this.highlightLayer = highlightLayer;
    this.editorEl = editorEl;

    bindEditorEvents(this.editorEl, this.lineNumbers, this.highlightLayer, file, {
      onUpdate: () => { this.updateLineNumbers(); this.updateHighlight(); this.renderTabs(); this.updateStatusBar(); },
      onSave: () => this.saveActive(),
    });
    this.updateLineNumbers();
    this.updateHighlight();
    this.updateStatusBar();
    this.editorEl.focus();
  }

  updateLineNumbers() {
    updateLineNumbers(this.lineNumbers, this.editorEl);
  }

  updateHighlight() {
    const file = this.openFiles.get(this.activeFile);
    if (!file) return;
    updateHighlight(this.highlightLayer, this.editorEl, file.lang);
  }

  updateStatusBar() {
    if (!this.statusBar || !this.editorEl) return;
    const file = this.openFiles.get(this.activeFile);
    if (!file) { this.statusBar.replaceChildren(); return; }
    updateStatusBar(this.statusBar, this.editorEl, file);
  }

  async saveActive() {
    const file = this.openFiles.get(this.activeFile);
    await saveFile(this.activeFile, file, this.statusBar, {
      onSuccess: () => {
        this.renderTabs();
        this.updateStatusBar();
      },
    }, { writefile: window.api.fs.writefile });
  }

  closeFile(filePath) {
    if (this.isModified(filePath)) {
      const file = this.openFiles.get(filePath);
      if (!confirm(`"${file.name}" has unsaved changes. Close anyway?`)) return;
    }

    this.openFiles.delete(filePath);

    if (this.activeFile === filePath) {
      if (this.openFiles.size > 0) {
        this.setActiveTab([...this.openFiles.keys()].pop());
      } else {
        this._resetEditor();
      }
    } else {
      this.renderTabs();
    }
  }

  _resetEditor() {
    this.activeFile = null;
    this.renderTabs();
    this.breadcrumb.textContent = '';
    this.showEmpty();
  }

  showEmpty() {
    this.editorWrapper.replaceChildren(_el('div', 'file-viewer-empty', EMPTY_MESSAGE));
    this.statusBar.replaceChildren();
  }

  // ===== Mode Bar =====

  _renderModeBar() {
    this.modeBar.replaceChildren();
    for (const { key, label } of STATIC_MODES) {
      const btn = _el('button', `mode-btn${this.mode === key ? ' active' : ''}`, label);
      btn.addEventListener('click', () => this.switchMode(key));
      this.modeBar.appendChild(btn);
    }
    for (const wt of this._webviewMgr.webviewTabs) {
      this.modeBar.appendChild(this._webviewMgr.buildWebviewModeBtn(wt, this.mode));
    }
    this.modeBar.appendChild(this._webviewMgr.buildAddWebviewBtn(this.modeBar));
  }

  // ===== Webview Management (delegated) =====

  addWebview(label, url) {
    this._webviewMgr.addWebview(label, url);
  }

  removeWebview(webviewId) {
    const removedId = this._webviewMgr.removeWebview(webviewId);
    if (this.mode === removedId) this.switchMode('files');
    else this._renderModeBar();
    /** @fires layout:changed {undefined} — webview removed from file-viewer */
    bus.emit(EVENTS.LAYOUT_CHANGED);
  }

  getWebviewTabs() {
    return this._webviewMgr.getWebviewTabs();
  }

  setWebviewTabs(tabs) {
    this._webviewMgr.setWebviewTabs(tabs);
  }

  dispose() {
    unsubscribeBus(this._busListeners);
    this._busListeners = [];
    this._webviewMgr.dispose();
  }
}

registerComponent('FileViewer', FileViewer);
