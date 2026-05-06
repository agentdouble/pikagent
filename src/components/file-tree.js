import { _el } from '../utils/dom.js';
import {
  DEBOUNCE_DELAY, WATCH_PREFIX,
  resolveWatchCwd,
} from '../utils/file-tree-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import { renderDirEntry, renderFileEntry } from '../utils/file-tree-renderer.js';
import {
  setupDropZone, handleFileDrop,
  promptRename as doPromptRename,
  promptNewEntry as doPromptNewEntry,
} from '../utils/file-tree-drop.js';
import { buildSectionHeader, refreshSectionDOM } from '../utils/file-tree-section-renderer.js';
import { bus, EVENTS } from '../utils/events.js';

export class FileTree {
  constructor(container) {
    this.container = container;
    this.termCwds = new Map();
    this.sections = new Map();
    this.debounceTimers = new Map();
    this._activeRow = null;

    this._contextMenuApi = {
      clipboardWrite: window.api.clipboard.write,
      fsCopy: window.api.fs.copy,
      showInFolder: window.api.shell.showInFolder,
      fsTrash: window.api.fs.trash,
    };
    this._dropApi = {
      copyTo: window.api.fs.copyTo,
      rename: window.api.fs.rename,
      mkdir: window.api.fs.mkdir,
      writefile: window.api.fs.writefile,
    };

    this.render();
    this.listenForChanges();
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
    this.unsubFs = window.api.fs.onChanged(({ id }) => {
      if (this.debounceTimers.has(id)) clearTimeout(this.debounceTimers.get(id));
      this.debounceTimers.set(id,
        setTimeout(() => {
          this.debounceTimers.delete(id);
          this.refreshSection(id).catch(() => {});
        }, DEBOUNCE_DELAY),
      );
    });
  }

  async setTerminalRoot(termId, dirPath) {
    const prevCwd = this.termCwds.get(termId);
    if (prevCwd === dirPath) return;
    if (prevCwd) this._removeTermFromSection(termId, prevCwd);
    this.termCwds.set(termId, dirPath);

    const existing = this.sections.get(dirPath);
    if (existing) { existing.termIds.add(termId); return; }

    const sectionEl = _el('div', { className: 'file-tree-section' });
    const expandedDirs = new Set([dirPath]);
    const watchId = `${WATCH_PREFIX}${dirPath}`;
    this.sections.set(dirPath, { termIds: new Set([termId]), sectionEl, expandedDirs, watchId });
    this.treeEl.appendChild(sectionEl);
    await this.refreshSection(dirPath);
    window.api.fs.watch(watchId, dirPath);
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
      window.api.fs.unwatch(section.watchId);
      section.sectionEl.remove();
      this.sections.delete(cwd);
    }
  }

  async refreshSection(watchIdOrCwd) {
    const cwd = resolveWatchCwd(watchIdOrCwd);
    const section = this.sections.get(cwd);
    if (!section) return;

    await refreshSectionDOM(section, cwd, {
      buildSectionHeader: (c, contentEl, chevron, expandedDirs) =>
        this._buildSectionHeader(c, contentEl, chevron, expandedDirs),
      setupDropZone: (el, targetDir) => this._setupDropZone(el, targetDir),
      renderDir: (dirPath, parentEl, depth, expandedDirs) =>
        this.renderDir(dirPath, parentEl, depth, expandedDirs),
      refreshSection: (c) => this.refreshSection(c),
    });
  }

  _buildSectionHeader(cwd, contentEl, chevron, expandedDirs) {
    return buildSectionHeader(cwd, contentEl, chevron, expandedDirs, {
      promptNewEntry: (dirPath, cEl, depth, eDirs, type) =>
        this.promptNewEntry(dirPath, cEl, depth, eDirs, type),
      promptRename: (path, nameEl) => this.promptRename(path, nameEl),
      onRefresh: (c) => this.refreshSection(c),
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

  promptRename(entryPath, nameEl) {
    doPromptRename(entryPath, nameEl, { rename: this._dropApi.rename });
  }

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
    chevron.textContent = '\u25BC';
    chevron.classList.add('expanded');
    await this.renderDir(dirPath, childContainer, depth + 1, expandedDirs);
  }

  _collapseDir(dirPath, childContainer, chevron, expandedDirs) {
    expandedDirs.delete(dirPath);
    childContainer.replaceChildren();
    chevron.textContent = '\u25B6';
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
    const entries = await window.api.fs.readdir(dirPath);
    for (const entry of entries) {
      if (entry.isDirectory) {
        await this._renderDirEntry(entry, parentEl, depth, expandedDirs);
      } else {
        this._renderFileEntry(entry, parentEl, depth);
      }
    }
  }

  dispose() {
    if (this.unsubFs) this.unsubFs();
    for (const [, section] of this.sections) {
      window.api.fs.unwatch(section.watchId);
    }
    this.sections.clear();
    this.termCwds.clear();
  }
}

registerComponent('FileTree', FileTree);
