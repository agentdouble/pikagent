import { detectLanguage } from '../utils/file-icons.js';
import { bus, unsubscribeBus, EVENTS } from '../utils/events.js';
import { _el } from '../utils/dom.js';
import { EMPTY_MESSAGE, MODE_ACTIVATE, pinnedFiles } from '../utils/editor-helpers.js';
import { createEditorDOM, bindEditorEvents, updateLineNumbers, updateHighlight, updateStatusBar, saveFile } from '../utils/file-editor-renderer.js';
import { createMarkdownPreviewDOM, updatePreviewStatusBar } from '../utils/markdown-preview-renderer.js';
import { renderTabs as renderTabsHelper } from '../utils/file-viewer-tabs.js';
import { registerComponent, getComponent } from '../utils/component-registry.js';
import { buildFileViewerLayout, setupFileViewerListeners, setModeVisibility, renderModeBar } from '../utils/file-viewer-renderer.js';

export class FileViewer {
  constructor(container, isActive) {
    this.container = container;
    this.isActive = isActive || (() => true);
    this.openFiles = new Map();
    this.activeFile = null;
    this.editorEl = null;
    this.lineNumbers = null;
    this.highlightLayer = null;
    this.mode = 'files';
    this.gitChanges = null;
    this._buildLayout();
    const WebviewManager = getComponent('WebviewManager');
    this._webviewMgr = new WebviewManager(
      this.container, this.statusBar,
      (mode) => this.switchMode(mode),
      () => this._renderModeBar(),
    );
    this._renderModeBar();
    this._busListeners = setupFileViewerListeners({
      isActive: () => this.isActive(),
      switchMode: (mode) => this.switchMode(mode),
      openFile: (path, name) => this.openFile(path, name),
      gitChanges: this.gitChanges,
      getMode: () => this.mode,
      loadPinnedFiles: () => this.loadPinnedFiles(),
    });
  }

  static get pinnedFiles() { return pinnedFiles; }

  _buildLayout() {
    const GitChangesView = getComponent('GitChangesView');
    const layout = buildFileViewerLayout(this.container, {
      createGitView: (el) => new GitChangesView(el),
    });
    this.modeBar = layout.modeBar;
    this.tabsBar = layout.tabsBar;
    this.breadcrumb = layout.breadcrumb;
    this.editorWrapper = layout.editorWrapper;
    this.gitViewEl = layout.gitViewEl;
    this.statusBar = layout.statusBar;
    this.gitChanges = layout.gitChanges;
    this.showEmpty();
  }

  async loadPinnedFiles() {
    for (const [path, info] of pinnedFiles) {
      if (!this.openFiles.has(path)) await this.openFile(path, info.name);
    }
  }

  isPinned(filePath) { return pinnedFiles.has(filePath); }

  togglePin(filePath) {
    const file = this.openFiles.get(filePath);
    if (!file) return;
    if (pinnedFiles.has(filePath)) pinnedFiles.delete(filePath);
    else pinnedFiles.set(filePath, { name: file.name });
    this.renderTabs();
  }

  switchMode(mode) {
    this.mode = mode;
    setModeVisibility(mode, this, this._webviewMgr);
    this._renderModeBar();
    MODE_ACTIVATE[mode]?.(this);
  }

  // ===== Files Mode =====

  async openFile(filePath, fileName) {
    if (this.openFiles.has(filePath)) { this.setActiveTab(filePath); return; }
    const result = await window.api.fs.readfile(filePath);
    if (result.error) {
      this.openFiles.set(filePath, { name: fileName, content: '', savedContent: '', lang: 'plaintext', error: result.error, viewMode: 'edit' });
    } else {
      const lang = detectLanguage(fileName);
      const viewMode = lang === 'markdown' ? 'preview' : 'edit';
      this.openFiles.set(filePath, { name: fileName, content: result.content, savedContent: result.content, lang, error: null, viewMode });
    }
    this.setActiveTab(filePath);
  }

  isMarkdown(filePath) {
    const file = this.openFiles.get(filePath);
    return !!file && file.lang === 'markdown';
  }

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

  isModified(filePath) {
    const file = this.openFiles.get(filePath);
    return !!file && file.content !== file.savedContent;
  }

  renderTabs() {
    renderTabsHelper(this.tabsBar, this.openFiles, this.activeFile,
      (p) => this.isPinned(p), (p) => this.isModified(p),
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
      this.lineNumbers = null; this.highlightLayer = null; this.editorEl = null;
      createMarkdownPreviewDOM(this.editorWrapper, file);
      updatePreviewStatusBar(this.statusBar, file);
      return;
    }
    const { lineNumbers, highlightLayer, editorEl } = createEditorDOM(this.editorWrapper, file);
    this.lineNumbers = lineNumbers; this.highlightLayer = highlightLayer; this.editorEl = editorEl;
    bindEditorEvents(this.editorEl, this.lineNumbers, this.highlightLayer, file, {
      onUpdate: () => { this.updateLineNumbers(); this.updateHighlight(); this.renderTabs(); this.updateStatusBar(); },
      onSave: () => this.saveActive(),
    });
    this.updateLineNumbers(); this.updateHighlight(); this.updateStatusBar();
    this.editorEl.focus();
  }

  updateLineNumbers() { updateLineNumbers(this.lineNumbers, this.editorEl); }

  updateHighlight() {
    const file = this.openFiles.get(this.activeFile);
    if (file) updateHighlight(this.highlightLayer, this.editorEl, file.lang);
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
      onSuccess: () => { this.renderTabs(); this.updateStatusBar(); },
    }, { writefile: window.api.fs.writefile });
  }

  closeFile(filePath) {
    if (this.isModified(filePath)) {
      const file = this.openFiles.get(filePath);
      if (!confirm(`"${file.name}" has unsaved changes. Close anyway?`)) return;
    }
    this.openFiles.delete(filePath);
    if (this.activeFile === filePath) {
      if (this.openFiles.size > 0) this.setActiveTab([...this.openFiles.keys()].pop());
      else this._resetEditor();
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

  _renderModeBar() {
    renderModeBar(this.modeBar, this.mode, {
      switchMode: (mode) => this.switchMode(mode),
      webviewMgr: this._webviewMgr,
    });
  }

  // ===== Webview Management (delegated) =====

  addWebview(label, url) { this._webviewMgr.addWebview(label, url); }

  removeWebview(webviewId) {
    const removedId = this._webviewMgr.removeWebview(webviewId);
    if (this.mode === removedId) this.switchMode('files');
    else this._renderModeBar();
    bus.emit(EVENTS.LAYOUT_CHANGED);
  }

  getWebviewTabs() { return this._webviewMgr.getWebviewTabs(); }
  setWebviewTabs(tabs) { this._webviewMgr.setWebviewTabs(tabs); }

  dispose() {
    unsubscribeBus(this._busListeners);
    this._busListeners = [];
    this._webviewMgr.dispose();
  }
}

registerComponent('FileViewer', FileViewer);
