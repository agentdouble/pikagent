import { _el } from '../utils/dom.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import {
  setupDropZone, handleFileDrop,
  promptRename as doPromptRename,
  promptNewEntry as doPromptNewEntry,
} from '../utils/file-tree-drop.js';
import { listenForChanges, stopWatch } from '../utils/file-tree-watcher.js';
import { rebuildSectionDOM } from '../utils/file-tree-section-dom.js';
import {
  renderDir as doRenderDir,
  setTerminalRoot as doSetTerminalRoot,
  removeTerminal as doRemoveTerminal,
  refreshSection as doRefreshSection,
} from '../utils/file-tree-dir-ops.js';
import { fileTreeViewFacade } from '../utils/file-tree-facade.js';

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
    this._contextMenuApi = {
      clipboardWrite: fileTreeViewFacade.clipboardWrite, fsCopy: fileTreeViewFacade.copy,
      showInFolder: fileTreeViewFacade.showInFolder, fsTrash: fileTreeViewFacade.trash,
    };
    this._dropApi = {
      copyTo: fileTreeViewFacade.copyTo, rename: fileTreeViewFacade.rename,
      mkdir: fileTreeViewFacade.mkdir, writefile: fileTreeViewFacade.writefile,
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
    this._track(listenForChanges(this.debounceTimers, (id) => this.refreshSection(id), { onChanged: fileTreeViewFacade.onChanged }));
  }

  async setTerminalRoot(termId, dirPath) {
    await doSetTerminalRoot(this, termId, dirPath, fileTreeViewFacade.watch, (c) => this.refreshSection(c), fileTreeViewFacade.unwatch);
  }

  removeTerminal(termId) { doRemoveTerminal(this, termId, fileTreeViewFacade.unwatch); }

  async refreshSection(watchIdOrCwd) {
    await doRefreshSection(this, watchIdOrCwd, (dp, pe, d, ed) => this.renderDir(dp, pe, d, ed));
  }

  findRootCwd(entryPath) {
    for (const [cwd] of this.sections) {
      if (entryPath.startsWith(cwd)) return cwd;
    }
    return '';
  }

  promptRename(entryPath, nameEl) { doPromptRename(entryPath, nameEl, { rename: this._dropApi.rename }); }
  promptNewEntry(dirPath, parentContentEl, depth, expandedDirs, type) { doPromptNewEntry(dirPath, parentContentEl, depth, expandedDirs, type, { mkdir: this._dropApi.mkdir, writefile: this._dropApi.writefile }); }

  _setupDropZone(el, getTargetDir) {
    const api = this._dropApi;
    setupDropZone(el, getTargetDir, (files, destDir) => handleFileDrop(files, destDir, { copyTo: api.copyTo }));
  }

  async renderDir(dirPath, parentEl, depth, expandedDirs) {
    await doRenderDir(this, dirPath, parentEl, depth, expandedDirs, fileTreeViewFacade.readdir);
  }

  dispose() {
    super.dispose();
    const unwatchApi = { unwatch: fileTreeViewFacade.unwatch };
    for (const [, section] of this.sections) stopWatch(section.watchId, unwatchApi);
    this.sections.clear();
    this.termCwds.clear();
  }
}

registerComponent('FileTree', FileTree);
