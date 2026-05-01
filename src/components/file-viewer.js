import { emitLayoutChanged } from '../utils/workspace-events.js';
import { _el } from '../utils/file-dom.js';
import { EMPTY_MESSAGE, MODE_CONFIG, ALL_STATIC_ELEMENTS, MODE_ACTIVATE, pinnedFiles } from '../utils/editor-helpers.js';
import {
  updateLineNumbers, updateHighlight, updateStatusBar, saveFile,
  initCodeEditor,
  createMarkdownPreviewDOM, updatePreviewStatusBar,
  renderTabs as renderTabsHelper,
  renderModeBar,
  setupFileViewerListeners,
} from '../utils/file-viewer-subsystem.js';
import {
  openFileEntry, isModified as isFileModified, isPinned as isFilePinned,
  togglePin as toggleFilePin, isMarkdown as isFileMarkdown, closeFileEntry,
} from '../utils/file-viewer-files.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';

export class FileViewer extends ComponentBase {
  /**
   * @param {HTMLElement} container
   * @param {() => boolean} [isActive]
   * @param {{ WebviewManager?: Function, GitChangesView?: Function }} [components]
   */
  constructor(container, isActive, components = {}) {
    super(container);
    this.isActive = isActive || (() => true);
    this._components = components;
    this.openFiles = new Map(); // path -> { name, content, savedContent, lang }
    this.activeFile = null;
    this.editorEl = null;
    this.lineNumbers = null;
    this.highlightLayer = null;
    this.mode = 'files'; // 'files' | 'git' | webview id
    this.gitChanges = null;
    this.render();
    this._initWebviewManager();
    this._initBusListeners();
  }

  _initWebviewManager() {
    const { WebviewManager } = this._components;
    this._webviewMgr = new WebviewManager(
      this.container, this.statusBar,
      (mode) => this.switchMode(mode),
      () => this._renderModeBar(),
    );
    this._renderModeBar();
  }

  _initBusListeners() {
    const busListeners = setupFileViewerListeners(
      { isActive: () => this.isActive() },
      {
        switchMode: (m) => this.switchMode(m),
        openFile: (p, n) => this.openFile(p, n),
        gitChanges: this.gitChanges,
        getMode: () => this.mode,
        loadPinnedFiles: () => this.loadPinnedFiles(),
      },
    );
    for (const unsub of busListeners) this._track(unsub);
  }

  static get pinnedFiles() { return pinnedFiles; }

  render() {
    this.container.replaceChildren();

    this.modeBar = _el('div', 'file-viewer-mode-bar');
    this.container.appendChild(this.modeBar);

    this.tabsBar = _el('div', 'file-viewer-tabs');
    this.container.appendChild(this.tabsBar);

    this.breadcrumb = _el('div', 'file-viewer-breadcrumb');
    this.container.appendChild(this.breadcrumb);

    this.editorWrapper = _el('div', 'editor-wrapper');
    this.container.appendChild(this.editorWrapper);

    this.gitViewEl = _el('div', 'git-changes-view');
    this.gitViewEl.style.display = 'none';
    this.container.appendChild(this.gitViewEl);
    const { GitChangesView } = this._components;
    this.gitChanges = new GitChangesView(this.gitViewEl);

    this.statusBar = _el('div', 'editor-status-bar');
    this.container.appendChild(this.statusBar);

    this.showEmpty();
  }

  async loadPinnedFiles() {
    for (const [path, info] of pinnedFiles) {
      if (!this.openFiles.has(path)) {
        await this.openFile(path, info.name);
      }
    }
  }

  isPinned(filePath) { return isFilePinned(filePath); }

  togglePin(filePath) {
    toggleFilePin(this.openFiles, filePath);
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
    await openFileEntry(this.openFiles, filePath, fileName, { readfile: window.api.fs.readfile });
    this.setActiveTab(filePath);
  }

  isMarkdown(filePath) { return isFileMarkdown(this.openFiles, filePath); }

  toggleViewMode(filePath) {
    const file = this.openFiles.get(filePath);
    if (!file || file.lang !== 'markdown') return;
    file.viewMode = file.viewMode === 'preview' ? 'edit' : 'preview';
    if (this.activeFile === filePath) this.renderEditor();
    this.renderTabs();
  }

  setActiveTab(filePath) {
    this.activeFile = filePath;
    this.renderTabs();
    this.renderEditor();
  }

  isModified(filePath) { return isFileModified(this.openFiles, filePath); }

  renderTabs() {
    renderTabsHelper(this.tabsBar, this.openFiles, this.activeFile,
      (p) => this.isPinned(p),
      (p) => this.isModified(p),
      {
        onClose: (p) => this.closeFile(p),
        onActivate: (p) => this.setActiveTab(p),
        onTogglePin: (p) => this.togglePin(p),
        isMarkdown: (p) => this.isMarkdown(p),
        getViewMode: (p) => this.openFiles.get(p)?.viewMode,
        onToggleViewMode: (p) => this.toggleViewMode(p),
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

    if (file.lang === 'markdown' && file.viewMode === 'preview') {
      this._renderMarkdownPreview(file);
      return;
    }

    this._renderCodeEditor(file);
  }

  _renderMarkdownPreview(file) {
    this.lineNumbers = null;
    this.highlightLayer = null;
    this.editorEl = null;
    createMarkdownPreviewDOM(this.editorWrapper, file);
    updatePreviewStatusBar(this.statusBar, file);
  }

  _renderCodeEditor(file) {
    const { lineNumbers, highlightLayer, editorEl } = initCodeEditor(this.editorWrapper, file, {
      onUpdate: () => { this.updateLineNumbers(); this.updateHighlight(); this.renderTabs(); this.updateStatusBar(); },
      onSave: () => this.saveActive(),
    });
    this.lineNumbers = lineNumbers;
    this.highlightLayer = highlightLayer;
    this.editorEl = editorEl;
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
    const result = closeFileEntry(this.openFiles, filePath, this.activeFile);
    if (result === false) return;
    if (result.switchTo === null) this._resetEditor();
    else if (result.switchTo !== undefined) this.setActiveTab(result.switchTo);
    else this.renderTabs();
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

  _renderModeBar() {
    renderModeBar(this.modeBar, this.mode, { switchMode: (m) => this.switchMode(m) }, this._webviewMgr);
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
    emitLayoutChanged();
  }

  getWebviewTabs() {
    return this._webviewMgr.getWebviewTabs();
  }

  setWebviewTabs(tabs) {
    this._webviewMgr.setWebviewTabs(tabs);
  }

  dispose() {
    super.dispose();
    this._webviewMgr.dispose();
  }
}

registerComponent('FileViewer', FileViewer);
