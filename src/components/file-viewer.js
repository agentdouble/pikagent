import { pinnedFiles } from '../utils/editor-helpers.js';
import {
  renderModeBar,
  setupFileViewerListeners,
  openFileEntry, isModified as isFileModified, isPinned as isFilePinned,
  togglePin as toggleFilePin, isMarkdown as isFileMarkdown, closeFileEntry,
  applyRequestedViewMode,
  renderFileViewerShell, renderEditor as doRenderEditor,
  showEmpty as doShowEmpty,
  updateLineNumbers as doUpdateLineNumbers,
  updateHighlight as doUpdateHighlight,
  updateStatusBar as doUpdateStatusBar,
  saveActive as doSaveActive,
  switchMode as doSwitchMode,
  renderTabs as doRenderTabs,
  loadPinnedFiles as doLoadPinnedFiles,
} from '../utils/file-viewer-utils.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import { tabViewFacade } from '../facades/tab-facade.js';

class FileViewer extends ComponentBase {
  constructor(container, isActive, components = {}) {
    super(container);
    this.isActive = isActive || (() => true);
    this._components = components;
    this.render();
    this._initWebviewManager();
    this._initBusListeners();
  }

  _initState() {
    this.openFiles = new Map();
    this.activeFile = this.editorEl = this.lineNumbers = this.highlightLayer = null;
    this.mode = 'files';
    this.gitChanges = null;
  }

  render() {
    if (!this._components) return;
    Object.assign(this, renderFileViewerShell(this.container, this._components));
    this.showEmpty();
  }

  _initWebviewManager() {
    const { WebviewManager } = this._components;
    this._webviewMgr = new WebviewManager(this.container, this.statusBar, (m) => this.switchMode(m), () => this._renderModeBar());
    this._renderModeBar();
  }

  _initBusListeners() {
    const unsubs = setupFileViewerListeners(
      { isActive: () => this.isActive() },
      { switchMode: (m) => this.switchMode(m), openFile: (p, n, opts) => this.openFile(p, n, opts), gitChanges: this.gitChanges, getMode: () => this.mode, loadPinnedFiles: () => this.loadPinnedFiles() },
    );
    for (const unsub of unsubs) this._track(unsub);
  }

  static get pinnedFiles() { return pinnedFiles; }

  async loadPinnedFiles() { await doLoadPinnedFiles(this); }

  isPinned(filePath) { return isFilePinned(filePath); }
  togglePin(filePath) { toggleFilePin(this.openFiles, filePath); this.renderTabs(); }
  isModified(filePath) { return isFileModified(this.openFiles, filePath); }
  isMarkdown(filePath) { return isFileMarkdown(this.openFiles, filePath); }

  switchMode(mode) { doSwitchMode(this, mode, this._webviewMgr, () => this._renderModeBar()); }

  async openFile(filePath, fileName, options = {}) {
    await openFileEntry(this.openFiles, filePath, fileName, { readfile: tabViewFacade.readfile }, options);
    applyRequestedViewMode(this.openFiles.get(filePath), options.viewMode);
    this.setActiveTab(filePath);
  }

  toggleViewMode(filePath) {
    const file = this.openFiles.get(filePath);
    if (!file || file.lang !== 'markdown') return;
    file.viewMode = file.viewMode === 'preview' ? 'edit' : 'preview';
    if (this.activeFile === filePath) this.renderEditor();
    this.renderTabs();
  }

  setActiveTab(filePath) { this.activeFile = filePath; this.renderTabs(); this.renderEditor(); }
  renderTabs() { doRenderTabs(this); }

  renderEditor() {
    const r = doRenderEditor(this, {
      onUpdate: () => { this.updateLineNumbers(); this.updateHighlight(); this.renderTabs(); this.updateStatusBar(); },
      onSave: () => this.saveActive(),
    });
    this.lineNumbers = r.lineNumbers;
    this.highlightLayer = r.highlightLayer;
    this.editorEl = r.editorEl;
  }

  updateLineNumbers() { doUpdateLineNumbers(this.lineNumbers, this.editorEl); }
  updateHighlight() { doUpdateHighlight(this.highlightLayer, this.editorEl, this.openFiles, this.activeFile); }
  updateStatusBar() { doUpdateStatusBar(this.statusBar, this.editorEl, this.openFiles, this.activeFile); }

  async saveActive() {
    await doSaveActive(this.openFiles, this.activeFile, this.statusBar,
      { onSuccess: () => { this.renderTabs(); this.updateStatusBar(); } }, tabViewFacade.writefile);
  }

  closeFile(filePath) {
    const result = closeFileEntry(this.openFiles, filePath, this.activeFile);
    if (result === false) return;
    if (result.switchTo === null) this._resetEditor();
    else if (result.switchTo !== undefined) this.setActiveTab(result.switchTo);
    else this.renderTabs();
  }

  _resetEditor() { this.activeFile = null; this.renderTabs(); this.breadcrumb.textContent = ''; this.showEmpty(); }
  showEmpty() { doShowEmpty(this.editorWrapper, this.statusBar); }
  _renderModeBar() { renderModeBar(this.modeBar, this.mode, { switchMode: (m) => this.switchMode(m) }, this._webviewMgr); }

  addWebview(label, url) { this._webviewMgr.addWebview(label, url); }
  removeWebview(webviewId) { this._webviewMgr.removeWebviewAndSync(webviewId, this.mode); }
  getWebviewTabs() { return this._webviewMgr.getWebviewTabs(); }
  setWebviewTabs(tabs) { this._webviewMgr.setWebviewTabs(tabs); }

  dispose() { super.dispose(); this._webviewMgr.dispose(); }
}

registerComponent('FileViewer', FileViewer);
