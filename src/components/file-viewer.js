import { detectLanguage } from '../utils/file-icons.js';
import { bus, subscribeBus, unsubscribeBus } from '../utils/events.js';
import { GitChangesView } from './git-changes-view.js';
import { contextMenu } from './context-menu.js';
import { _el } from '../utils/dom.js';
import { getCursorPosition, insertTab, SAVE_FLASH_MS, TAB_SPACES, EMPTY_MESSAGE, STATIC_MODES, MODE_CONFIG, ALL_STATIC_ELEMENTS, MODE_ACTIVATE, pinnedFiles } from '../utils/editor-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import { WebviewManager } from './file-viewer-webview.js';

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
    this.gitChanges = new GitChangesView(this.gitViewEl);

    this.statusBar = _el('div', 'editor-status-bar');
    this.container.appendChild(this.statusBar);

    this.showEmpty();
  }

  _setupListeners() {
    // Bus event listeners — single declaration drives both subscription and cleanup
    this._busListeners = subscribeBus([
      ['file:open', ({ path, name }) => {
        if (!this.isActive()) return;
        this.switchMode('files');
        this.openFile(path, name);
      }],
      ['terminal:cwdChanged', ({ cwd }) => {
        if (!this.isActive()) return;
        this.gitChanges.setCwd(cwd);
        if (this.mode === 'git') this.gitChanges.loadChanges();
      }],
      ['workspace:activated', () => {
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

  _createTabEl(filePath, file) {
    const tab = _el('div', 'file-tab');
    if (filePath === this.activeFile) tab.classList.add('active');

    const pinned = this.isPinned(filePath);
    const modified = this.isModified(filePath);

    if (pinned) tab.appendChild(_el('span', 'file-tab-pin', '\u{1F4CC}'));
    tab.appendChild(_el('span', 'file-tab-modified', modified ? '\u25CF' : ''));
    tab.appendChild(_el('span', null, file.name));

    const close = _el('span', 'file-tab-close', '\u00D7');
    close.addEventListener('click', (e) => { e.stopPropagation(); this.closeFile(filePath); });
    tab.appendChild(close);

    tab.addEventListener('click', () => this.setActiveTab(filePath));
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      contextMenu.show(e.clientX, e.clientY, [
        { label: pinned ? 'Unpin from all workspaces' : 'Pin across workspaces', action: () => this.togglePin(filePath) },
        { separator: true },
        { label: 'Close', action: () => this.closeFile(filePath) },
      ]);
    });

    return tab;
  }

  renderTabs() {
    this.tabsBar.replaceChildren();
    for (const [filePath, file] of this.openFiles) {
      this.tabsBar.appendChild(this._createTabEl(filePath, file));
    }
  }

  _createEditorDOM(file) {
    this.lineNumbers = _el('div', 'editor-line-numbers');
    this.highlightLayer = _el('pre', 'editor-highlight-layer');

    this.editorEl = _el('textarea', 'editor-textarea');
    this.editorEl.value = file.content;
    this.editorEl.spellcheck = false;
    this.editorEl.setAttribute('autocorrect', 'off');
    this.editorEl.setAttribute('autocapitalize', 'off');

    const editArea = _el('div', 'editor-edit-area');
    editArea.append(this.highlightLayer, this.editorEl);
    this.editorWrapper.append(this.lineNumbers, editArea);
  }

  _bindEditorEvents(file) {
    this.editorEl.addEventListener('input', () => {
      file.content = this.editorEl.value;
      this.updateLineNumbers();
      this.updateHighlight();
      this.renderTabs();
      this.updateStatusBar();
    });

    this.editorEl.addEventListener('scroll', () => {
      this.lineNumbers.scrollTop = this.editorEl.scrollTop;
      this.highlightLayer.scrollTop = this.editorEl.scrollTop;
      this.highlightLayer.scrollLeft = this.editorEl.scrollLeft;
    });

    this.editorEl.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        this.saveActive();
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const result = insertTab(this.editorEl.value, this.editorEl.selectionStart, this.editorEl.selectionEnd, TAB_SPACES);
        this.editorEl.value = result.text;
        this.editorEl.selectionStart = this.editorEl.selectionEnd = result.cursorPos;
        this.editorEl.dispatchEvent(new Event('input'));
      }
    });
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

    this._createEditorDOM(file);
    this._bindEditorEvents(file);
    this.updateLineNumbers();
    this.updateHighlight();
    this.updateStatusBar();
    this.editorEl.focus();
  }

  updateLineNumbers() {
    if (!this.lineNumbers || !this.editorEl) return;
    const count = this.editorEl.value.split('\n').length;
    const frag = document.createDocumentFragment();
    for (let i = 1; i <= count; i++) {
      if (i > 1) frag.appendChild(document.createTextNode('\n'));
      frag.appendChild(_el('span', null, String(i)));
    }
    this.lineNumbers.replaceChildren(frag);
  }

  updateHighlight() {
    if (!this.highlightLayer || !this.editorEl) return;
    const file = this.openFiles.get(this.activeFile);
    if (!file) return;

    const code = document.createElement('code');
    code.className = `language-${file.lang}`;
    // Need trailing newline so the pre sizing matches the textarea
    code.textContent = this.editorEl.value + '\n';

    this.highlightLayer.replaceChildren(code);

    if (window.hljs) {
      window.hljs.highlightElement(code);
    }
  }

  _getCursorPosition() {
    return getCursorPosition(this.editorEl.value, this.editorEl.selectionStart);
  }

  updateStatusBar() {
    if (!this.statusBar || !this.editorEl) return;
    const file = this.openFiles.get(this.activeFile);
    if (!file) { this.statusBar.replaceChildren(); return; }

    const { line, col, totalLines } = this._getCursorPosition();
    const modified = this.isModified(this.activeFile);

    this.statusBar.replaceChildren(
      _el('span', 'status-item', file.lang),
      _el('span', 'status-item', `Ln ${line}, Col ${col}`),
      _el('span', 'status-item', `${totalLines} lines`),
      _el('span', modified ? 'status-item status-modified' : 'status-item status-saved', modified ? 'Modified' : 'Saved'),
      _el('span', 'status-save-hint', modified ? '\u2318S to save' : ''),
    );
  }

  async saveActive() {
    const file = this.openFiles.get(this.activeFile);
    if (!file || file.error) return;

    const result = await window.api.fs.writefile(this.activeFile, file.content);
    if (result.error) {
      this.statusBar.replaceChildren(_el('span', 'status-item status-error', `Save failed: ${result.error}`));
      return;
    }

    file.savedContent = file.content;
    this.renderTabs();
    this.updateStatusBar();

    // Flash save indicator
    this.statusBar.classList.add('save-flash');
    setTimeout(() => this.statusBar.classList.remove('save-flash'), SAVE_FLASH_MS);
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

  _buildStaticModeBtn({ key, label }) {
    const btn = _el('button', `mode-btn${this.mode === key ? ' active' : ''}`, label);
    btn.addEventListener('click', () => this.switchMode(key));
    return btn;
  }

  _renderModeBar() {
    this.modeBar.replaceChildren();

    for (const mode of STATIC_MODES) {
      this.modeBar.appendChild(this._buildStaticModeBtn(mode));
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
    bus.emit('layout:changed');
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
