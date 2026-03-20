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

  render() {
    this.container.innerHTML = '';

    // Mode selector bar
    this.modeBar = document.createElement('div');
    this.modeBar.className = 'file-viewer-mode-bar';

    this.btnFiles = document.createElement('button');
    this.btnFiles.className = 'mode-btn active';
    this.btnFiles.textContent = 'Files';
    this.btnFiles.addEventListener('click', () => this.switchMode('files'));

    this.btnGit = document.createElement('button');
    this.btnGit.className = 'mode-btn';
    this.btnGit.textContent = 'Git Changes';
    this.btnGit.addEventListener('click', () => this.switchMode('git'));

    this.modeBar.appendChild(this.btnFiles);
    this.modeBar.appendChild(this.btnGit);
    this.container.appendChild(this.modeBar);

    // Tabs bar (files mode)
    this.tabsBar = document.createElement('div');
    this.tabsBar.className = 'file-viewer-tabs';
    this.container.appendChild(this.tabsBar);

    // Breadcrumb (files mode)
    this.breadcrumb = document.createElement('div');
    this.breadcrumb.className = 'file-viewer-breadcrumb';
    this.container.appendChild(this.breadcrumb);

    // Editor wrapper (files mode)
    this.editorWrapper = document.createElement('div');
    this.editorWrapper.className = 'editor-wrapper';
    this.container.appendChild(this.editorWrapper);

    // Git view (git mode)
    const gitViewEl = document.createElement('div');
    gitViewEl.className = 'git-changes-view';
    gitViewEl.style.display = 'none';
    this.container.appendChild(gitViewEl);
    this.gitChanges = new GitChangesView(gitViewEl);
    this.gitViewEl = gitViewEl;

    // Status bar
    this.statusBar = document.createElement('div');
    this.statusBar.className = 'editor-status-bar';
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

  switchMode(mode) {
    this.mode = mode;
    this.btnFiles.classList.toggle('active', mode === 'files');
    this.btnGit.classList.toggle('active', mode === 'git');

    if (mode === 'files') {
      this.tabsBar.style.display = '';
      this.breadcrumb.style.display = '';
      this.editorWrapper.style.display = '';
      this.gitViewEl.style.display = 'none';
      this.statusBar.style.display = '';
      if (this.activeFile) {
        this.renderEditor();
      }
    } else {
      this.tabsBar.style.display = 'none';
      this.breadcrumb.style.display = 'none';
      this.editorWrapper.style.display = 'none';
      this.gitViewEl.style.display = '';
      this.statusBar.style.display = 'none';
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

  renderTabs() {
    this.tabsBar.innerHTML = '';

    for (const [filePath, file] of this.openFiles) {
      const tab = document.createElement('div');
      tab.className = 'file-tab';
      if (filePath === this.activeFile) tab.classList.add('active');

      const pinned = this.isPinned(filePath);
      const modified = this.isModified(filePath);

      if (pinned) {
        const pin = document.createElement('span');
        pin.className = 'file-tab-pin';
        pin.textContent = '\u{1F4CC}';
        tab.appendChild(pin);
      }

      const dot = document.createElement('span');
      dot.className = 'file-tab-modified';
      dot.textContent = modified ? '\u25CF' : '';
      tab.appendChild(dot);

      const name = document.createElement('span');
      name.textContent = file.name;
      tab.appendChild(name);

      const close = document.createElement('span');
      close.className = 'file-tab-close';
      close.textContent = '\u00D7';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeFile(filePath);
      });
      tab.appendChild(close);

      tab.addEventListener('click', () => this.setActiveTab(filePath));

      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenu.show(e.clientX, e.clientY, [
          {
            label: pinned ? 'Unpin from all workspaces' : 'Pin across workspaces',
            action: () => this.togglePin(filePath),
          },
          { separator: true },
          { label: 'Close', action: () => this.closeFile(filePath) },
        ]);
      });

      this.tabsBar.appendChild(tab);
    }
  }

  renderEditor() {
    this.editorWrapper.innerHTML = '';
    this.statusBar.innerHTML = '';

    const file = this.openFiles.get(this.activeFile);
    if (!file) {
      this.showEmpty();
      return;
    }

    this.breadcrumb.textContent = this.activeFile;

    if (file.error) {
      this.editorWrapper.innerHTML = `<div class="file-viewer-error">${file.error}</div>`;
      return;
    }

    // Line numbers
    this.lineNumbers = document.createElement('div');
    this.lineNumbers.className = 'editor-line-numbers';

    // Highlight layer (behind textarea)
    this.highlightLayer = document.createElement('pre');
    this.highlightLayer.className = 'editor-highlight-layer';

    // Textarea
    this.editorEl = document.createElement('textarea');
    this.editorEl.className = 'editor-textarea';
    this.editorEl.value = file.content;
    this.editorEl.spellcheck = false;
    this.editorEl.setAttribute('autocorrect', 'off');
    this.editorEl.setAttribute('autocapitalize', 'off');

    // Container that holds highlight + textarea stacked
    const editArea = document.createElement('div');
    editArea.className = 'editor-edit-area';
    editArea.appendChild(this.highlightLayer);
    editArea.appendChild(this.editorEl);

    this.editorWrapper.appendChild(this.lineNumbers);
    this.editorWrapper.appendChild(editArea);

    // Events
    this.editorEl.addEventListener('input', () => {
      file.content = this.editorEl.value;
      this.updateLineNumbers();
      this.updateHighlight();
      this.renderTabs(); // update modified dot
      this.updateStatusBar();
    });

    this.editorEl.addEventListener('scroll', () => {
      this.lineNumbers.scrollTop = this.editorEl.scrollTop;
      this.highlightLayer.scrollTop = this.editorEl.scrollTop;
      this.highlightLayer.scrollLeft = this.editorEl.scrollLeft;
    });

    this.editorEl.addEventListener('keydown', (e) => {
      // Save: Cmd+S / Ctrl+S
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        e.stopPropagation();
        this.saveActive();
        return;
      }

      // Tab key inserts 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = this.editorEl.selectionStart;
        const end = this.editorEl.selectionEnd;
        const val = this.editorEl.value;
        this.editorEl.value = val.substring(0, start) + '  ' + val.substring(end);
        this.editorEl.selectionStart = this.editorEl.selectionEnd = start + 2;
        this.editorEl.dispatchEvent(new Event('input'));
      }
    });

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

  updateStatusBar() {
    if (!this.statusBar || !this.editorEl) return;
    const file = this.openFiles.get(this.activeFile);
    if (!file) { this.statusBar.innerHTML = ''; return; }

    const lines = this.editorEl.value.split('\n').length;
    const pos = this.editorEl.selectionStart;
    const textBefore = this.editorEl.value.substring(0, pos);
    const line = textBefore.split('\n').length;
    const col = pos - textBefore.lastIndexOf('\n');
    const modified = this.isModified(this.activeFile);

    this.statusBar.innerHTML = `
      <span class="status-item">${file.lang}</span>
      <span class="status-item">Ln ${line}, Col ${col}</span>
      <span class="status-item">${lines} lines</span>
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
    // Warn if modified
    if (this.isModified(filePath)) {
      const file = this.openFiles.get(filePath);
      if (!confirm(`"${file.name}" has unsaved changes. Close anyway?`)) return;
    }

    this.openFiles.delete(filePath);

    if (this.activeFile === filePath) {
      if (this.openFiles.size > 0) {
        const lastKey = [...this.openFiles.keys()].pop();
        this.setActiveTab(lastKey);
      } else {
        this.activeFile = null;
        this.renderTabs();
        this.breadcrumb.textContent = '';
        this.editorWrapper.innerHTML = '';
        this.statusBar.innerHTML = '';
        this.showEmpty();
      }
    } else {
      this.renderTabs();
    }
  }

  showEmpty() {
    this.editorWrapper.innerHTML =
      '<div class="file-viewer-empty">Click a file to view its content</div>';
    this.statusBar.innerHTML = '';
  }
}
