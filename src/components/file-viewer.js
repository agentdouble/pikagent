import { detectLanguage } from '../utils/file-icons.js';
import { bus } from '../utils/events.js';
import { GitChangesView } from './git-changes-view.js';
import { contextMenu } from './context-menu.js';

// Global pinned files: path -> { name }
const pinnedFiles = new Map();

export class FileViewer {
  constructor(container, isActive) {
    this.container = container;
    this.isActive = isActive || (() => true);
    this.openFiles = new Map(); // path -> { name, content, savedContent, lang }
    this.activeFile = null;
    this.editorEl = null;
    this.lineNumbers = null;
    this.highlightLayer = null;
    this.mode = 'files'; // 'files' | 'git'
    this.gitChanges = null; // initialized after render()
    this.render();
    this.listen();
  }

  static get pinnedFiles() { return pinnedFiles; }

  _el(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  render() {
    this.container.innerHTML = '';

    this.container.appendChild(this._el('div', 'file-viewer-spacer'));

    this.btnFiles = this._el('button', 'mode-btn active', 'Files');
    this.btnFiles.addEventListener('click', () => this.switchMode('files'));
    this.btnGit = this._el('button', 'mode-btn', 'Git Changes');
    this.btnGit.addEventListener('click', () => this.switchMode('git'));

    this.modeBar = this._el('div', 'file-viewer-mode-bar');
    this.modeBar.append(this.btnFiles, this.btnGit);
    this.container.appendChild(this.modeBar);

    this.tabsBar = this._el('div', 'file-viewer-tabs');
    this.container.appendChild(this.tabsBar);

    this.breadcrumb = this._el('div', 'file-viewer-breadcrumb');
    this.container.appendChild(this.breadcrumb);

    this.editorWrapper = this._el('div', 'editor-wrapper');
    this.container.appendChild(this.editorWrapper);

    this.gitViewEl = this._el('div', 'git-changes-view');
    this.gitViewEl.style.display = 'none';
    this.container.appendChild(this.gitViewEl);
    this.gitChanges = new GitChangesView(this.gitViewEl);

    this.statusBar = this._el('div', 'editor-status-bar');
    this.container.appendChild(this.statusBar);

    this.showEmpty();
  }

  listen() {
    bus.on('file:open', ({ path, name }) => {
      if (!this.isActive()) return;
      this.switchMode('files');
      this.openFile(path, name);
    });

    bus.on('terminal:cwdChanged', ({ cwd }) => {
      if (!this.isActive()) return;
      this.gitChanges.setCwd(cwd);
      if (this.mode === 'git') this.gitChanges.loadChanges();
    });

    bus.on('workspace:activated', () => {
      if (!this.isActive()) return;
      this.loadPinnedFiles();
    });
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

  _setModeVisibility(isFiles) {
    const show = (el, visible) => { el.style.display = visible ? '' : 'none'; };
    show(this.tabsBar, isFiles);
    show(this.breadcrumb, isFiles);
    show(this.editorWrapper, isFiles);
    show(this.statusBar, isFiles);
    show(this.gitViewEl, !isFiles);
  }

  switchMode(mode) {
    this.mode = mode;
    this.btnFiles.classList.toggle('active', mode === 'files');
    this.btnGit.classList.toggle('active', mode === 'git');
    this._setModeVisibility(mode === 'files');

    if (mode === 'files') {
      if (this.activeFile) this.renderEditor();
    } else {
      this.gitChanges.loadChanges();
    }
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
    const tab = this._el('div', 'file-tab');
    if (filePath === this.activeFile) tab.classList.add('active');

    const pinned = this.isPinned(filePath);
    const modified = this.isModified(filePath);

    if (pinned) tab.appendChild(this._el('span', 'file-tab-pin', '\u{1F4CC}'));
    tab.appendChild(this._el('span', 'file-tab-modified', modified ? '\u25CF' : ''));
    tab.appendChild(this._el('span', null, file.name));

    const close = this._el('span', 'file-tab-close', '\u00D7');
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
    this.tabsBar.innerHTML = '';
    for (const [filePath, file] of this.openFiles) {
      this.tabsBar.appendChild(this._createTabEl(filePath, file));
    }
  }

  _createEditorDOM(file) {
    this.lineNumbers = this._el('div', 'editor-line-numbers');
    this.highlightLayer = this._el('pre', 'editor-highlight-layer');

    this.editorEl = this._el('textarea', 'editor-textarea');
    this.editorEl.value = file.content;
    this.editorEl.spellcheck = false;
    this.editorEl.setAttribute('autocorrect', 'off');
    this.editorEl.setAttribute('autocapitalize', 'off');

    const editArea = this._el('div', 'editor-edit-area');
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
        const { selectionStart: start, selectionEnd: end, value: val } = this.editorEl;
        this.editorEl.value = val.substring(0, start) + '  ' + val.substring(end);
        this.editorEl.selectionStart = this.editorEl.selectionEnd = start + 2;
        this.editorEl.dispatchEvent(new Event('input'));
      }
    });
  }

  renderEditor() {
    this.editorWrapper.innerHTML = '';
    this.statusBar.innerHTML = '';

    const file = this.openFiles.get(this.activeFile);
    if (!file) { this.showEmpty(); return; }

    this.breadcrumb.textContent = this.activeFile;

    if (file.error) {
      this.editorWrapper.innerHTML = `<div class="file-viewer-error">${file.error}</div>`;
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
    const lines = [];
    for (let i = 1; i <= count; i++) {
      lines.push(`<span>${i}</span>`);
    }
    this.lineNumbers.innerHTML = lines.join('\n');
  }

  updateHighlight() {
    if (!this.highlightLayer || !this.editorEl) return;
    const file = this.openFiles.get(this.activeFile);
    if (!file) return;

    const code = document.createElement('code');
    code.className = `language-${file.lang}`;
    // Need trailing newline so the pre sizing matches the textarea
    code.textContent = this.editorEl.value + '\n';

    this.highlightLayer.innerHTML = '';
    this.highlightLayer.appendChild(code);

    if (window.hljs) {
      window.hljs.highlightElement(code);
    }
  }

  _getCursorPosition() {
    const pos = this.editorEl.selectionStart;
    const textBefore = this.editorEl.value.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    const totalLines = this.editorEl.value.split('\n').length;
    return { line, col, totalLines };
  }

  updateStatusBar() {
    if (!this.statusBar || !this.editorEl) return;
    const file = this.openFiles.get(this.activeFile);
    if (!file) { this.statusBar.innerHTML = ''; return; }

    const { line, col, totalLines } = this._getCursorPosition();
    const modified = this.isModified(this.activeFile);

    this.statusBar.innerHTML = `
      <span class="status-item">${file.lang}</span>
      <span class="status-item">Ln ${line}, Col ${col}</span>
      <span class="status-item">${totalLines} lines</span>
      ${modified ? '<span class="status-item status-modified">Modified</span>' : '<span class="status-item status-saved">Saved</span>'}
      <span class="status-save-hint">${modified ? '⌘S to save' : ''}</span>
    `;
  }

  async saveActive() {
    const file = this.openFiles.get(this.activeFile);
    if (!file || file.error) return;

    const result = await window.api.fs.writefile(this.activeFile, file.content);
    if (result.error) {
      this.statusBar.innerHTML = `<span class="status-item status-error">Save failed: ${result.error}</span>`;
      return;
    }

    file.savedContent = file.content;
    this.renderTabs();
    this.updateStatusBar();

    // Flash save indicator
    this.statusBar.classList.add('save-flash');
    setTimeout(() => this.statusBar.classList.remove('save-flash'), 600);
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
    this.editorWrapper.innerHTML =
      '<div class="file-viewer-empty">Click a file to view its content</div>';
    this.statusBar.innerHTML = '';
  }
}
