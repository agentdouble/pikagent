import { _el } from '../utils/file-dom.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import {
  CHEVRON_EXPANDED, CHEVRON_COLLAPSED,
  resolveWatchCwd,
  renderDirEntry, renderFileEntry,
  setupDropZone, handleFileDrop,
  promptRename as doPromptRename,
  promptNewEntry as doPromptNewEntry,
  listenForChanges, startWatch, stopWatch,
} from '../utils/file-tree-subsystem.js';
import { rebuildSectionDOM } from '../utils/file-tree-section-dom.js';
import { fsApi, shellApi, clipboardApi } from '../utils/file-tree-api.js';

export class FileTree extends ComponentBase {
  constructor(container) {
    super(container);
    this._initState();
    this._initApi();
    this.render();
    this.listenForChanges();
  }

  _initState() {
    this.termCwds = new Map();
    this.sections = new Map();
    this.debounceTimers = new Map();
    this._activeRow = null;
  }

  _initApi() {
    // Injected API methods for file-tree-drop and file-tree-context-menu utils
    this._contextMenuApi = {
      clipboardWrite: clipboardApi.write,
      fsCopy: fsApi.copy,
      showInFolder: shellApi.showInFolder,
      fsTrash: fsApi.trash,
    };
    this._dropApi = {
      copyTo: fsApi.copyTo,
      rename: fsApi.rename,
      mkdir: fsApi.mkdir,
      writefile: fsApi.writefile,
    };
  }

  render() {
    this.container.replaceChildren();
    this.treeEl = _el('div', { className: 'file-tree-content' });
    this.container.appendChild(this.treeEl);

    this._setupDropZone(this.container, () => {
      const firstCwd = this.sections.keys().next().value;
      return firstCwd || null;
    });
  }

  listenForChanges() {
    this._track(listenForChanges(this.debounceTimers, (id) => this.refreshSection(id), { onChanged: fsApi.onChanged }));
  }

  async setTerminalRoot(termId, dirPath) {
    const prevCwd = this.termCwds.get(termId);
    if (prevCwd === dirPath) return;

    if (prevCwd) {
      this._removeTermFromSection(termId, prevCwd);
    }

    this.termCwds.set(termId, dirPath);

    const existing = this.sections.get(dirPath);
    if (existing) {
      existing.termIds.add(termId);
      return;
    }

    const sectionEl = _el('div', { className: 'file-tree-section' });
    const expandedDirs = new Set([dirPath]);
    const watchId = startWatch(dirPath, { watch: fsApi.watch });
    this.sections.set(dirPath, { termIds: new Set([termId]), sectionEl, expandedDirs, watchId });
    this.treeEl.appendChild(sectionEl);
    await this.refreshSection(dirPath);
  }

  removeTerminal(termId) {
    const cwd = this.termCwds.get(termId);
    if (!cwd) return;
    this.termCwds.delete(termId);
    this._removeTermFromSection(termId, cwd);
  }

  _removeTermFromSection(termId, cwd) {
    const section = this.sections.get(cwd);
    if (!section) return;

    section.termIds.delete(termId);

    if (section.termIds.size === 0) {
      stopWatch(section.watchId, { unwatch: fsApi.unwatch });
      section.sectionEl.remove();
      this.sections.delete(cwd);
    }
  }

  async refreshSection(watchIdOrCwd) {
    const cwd = resolveWatchCwd(watchIdOrCwd);
    const section = this.sections.get(cwd);
    if (!section) return;

    if (section._refreshing) {
      section._pendingRefresh = true;
      return;
    }
    section._refreshing = true;

    const contentEl = this._rebuildSectionDOM(section, cwd);

    try {
      await this.renderDir(cwd, contentEl, 0, section.expandedDirs);
    } finally {
      section._refreshing = false;
      if (section._pendingRefresh) {
        section._pendingRefresh = false;
        this.refreshSection(cwd).catch(() => {});
      }
    }
  }

  _rebuildSectionDOM(section, cwd) {
    return rebuildSectionDOM(section, cwd, {
      setupDropZone: (el, targetDir) => this._setupDropZone(el, targetDir),
      promptNewEntry: (dirPath, cEl, depth, eDirs, type) => this.promptNewEntry(dirPath, cEl, depth, eDirs, type),
      promptRename: (path, nameEl) => this.promptRename(path, nameEl),
      refreshSection: (c) => this.refreshSection(c),
      contextMenuApi: this._contextMenuApi,
    });
  }

  // --- Context menu helpers ---

  findRootCwd(entryPath) {
    for (const [cwd] of this.sections) {
      if (entryPath.startsWith(cwd)) return cwd;
    }
    return '';
  }

  // --- Rename inline input ---

  promptRename(entryPath, nameEl) {
    doPromptRename(entryPath, nameEl, { rename: this._dropApi.rename });
  }

  // --- New File / Folder inline input ---

  promptNewEntry(dirPath, parentContentEl, depth, expandedDirs, type) {
    doPromptNewEntry(dirPath, parentContentEl, depth, expandedDirs, type, { mkdir: this._dropApi.mkdir, writefile: this._dropApi.writefile });
  }

  // --- Drag & Drop ---

  _setupDropZone(el, getTargetDir) {
    const api = this._dropApi;
    setupDropZone(el, getTargetDir, (files, destDir) => handleFileDrop(files, destDir, { copyTo: api.copyTo }));
  }

  // --- Directory expand/collapse ---

  async _expandDir(dirPath, childContainer, chevron, depth, expandedDirs) {
    expandedDirs.add(dirPath);
    chevron.textContent = CHEVRON_EXPANDED;
    chevron.classList.add('expanded');
    await this.renderDir(dirPath, childContainer, depth + 1, expandedDirs);
  }

  _collapseDir(dirPath, childContainer, chevron, expandedDirs) {
    expandedDirs.delete(dirPath);
    childContainer.replaceChildren();
    chevron.textContent = CHEVRON_COLLAPSED;
    chevron.classList.remove('expanded');
  }

  // --- Render directory entries ---

  _getDirEntryCallbacks(expandedDirs) {
    return {
      setupDropZone: (el, targetDir) => this._setupDropZone(el, targetDir),
      expandDir: (dirPath, childContainer, chevron, depth, eDirs) =>
        this._expandDir(dirPath, childContainer, chevron, depth, eDirs),
      collapseDir: (dirPath, childContainer, chevron, eDirs) =>
        this._collapseDir(dirPath, childContainer, chevron, eDirs),
      renderDir: (dirPath, parentEl, depth, eDirs) =>
        this.renderDir(dirPath, parentEl, depth, eDirs),
      findRootCwd: (entryPath) => this.findRootCwd(entryPath),
      promptRename: (path, nameEl) => this.promptRename(path, nameEl),
      promptNewEntry: (dirPath, cEl, depth, eDirs, type) =>
        this.promptNewEntry(dirPath, cEl, depth, eDirs, type),
      contextMenuApi: this._contextMenuApi,
    };
  }

  async _renderDirEntry(entry, parentEl, depth, expandedDirs) {
    await renderDirEntry(entry, parentEl, depth, expandedDirs, this._getDirEntryCallbacks(expandedDirs));
  }

  _renderFileEntry(entry, parentEl, depth) {
    const self = this;
    const activeRowRef = {
      get current() { return self._activeRow; },
      set current(v) { self._activeRow = v; },
    };
    renderFileEntry(entry, parentEl, depth, {
      activeRowRef,
      findRootCwd: (entryPath) => this.findRootCwd(entryPath),
      promptRename: (path, nameEl) => this.promptRename(path, nameEl),
      contextMenuApi: this._contextMenuApi,
    });
  }

  async renderDir(dirPath, parentEl, depth, expandedDirs) {
    const entries = await fsApi.readdir(dirPath);
    for (const entry of entries) {
      if (entry.isDirectory) {
        await this._renderDirEntry(entry, parentEl, depth, expandedDirs);
      } else {
        this._renderFileEntry(entry, parentEl, depth);
      }
    }
  }

  dispose() {
    super.dispose();
    const unwatchApi = { unwatch: fsApi.unwatch };
    for (const [, section] of this.sections) {
      stopWatch(section.watchId, unwatchApi);
    }
    this.sections.clear();
    this.termCwds.clear();
  }
}

registerComponent('FileTree', FileTree);
