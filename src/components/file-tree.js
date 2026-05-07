import { _el } from '../utils/file-dom.js';
import { registerComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import {
  setupDropZone, handleFileDrop,
  promptRename as doPromptRename,
  promptNewEntry as doPromptNewEntry,
  listenForChanges, stopWatch,
} from '../utils/file-tree-subsystem.js';
import { rebuildSectionDOM } from '../utils/file-tree-section-dom.js';
import {
  renderDir as doRenderDir,
  setTerminalRoot as doSetTerminalRoot,
  removeTerminal as doRemoveTerminal,
  refreshSection as doRefreshSection,
} from '../utils/file-tree-dir-ops.js';
import { fileTreeFacade } from '../utils/file-tree-services.js';

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
      clipboardWrite: fileTreeFacade.clipboardWrite, fsCopy: fileTreeFacade.copy,
      showInFolder: fileTreeFacade.showInFolder, fsTrash: fileTreeFacade.trash,
    };
    this._dropApi = {
      copyTo: fileTreeFacade.copyTo, rename: fileTreeFacade.rename,
      mkdir: fileTreeFacade.mkdir, writefile: fileTreeFacade.writefile,
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
    this._track(listenForChanges(this.debounceTimers, (id) => this.refreshSection(id), { onChanged: fileTreeFacade.onChanged }));
  }

  async setTerminalRoot(termId, dirPath) {
    await doSetTerminalRoot(this, termId, dirPath, fileTreeFacade.watch, (c) => this.refreshSection(c), fileTreeFacade.unwatch);
  }

  removeTerminal(termId) { doRemoveTerminal(this, termId, fileTreeFacade.unwatch); }

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
    await doRenderDir(this, dirPath, parentEl, depth, expandedDirs, fileTreeFacade.readdir);
  }

  dispose() {
    super.dispose();
    const unwatchApi = { unwatch: fileTreeFacade.unwatch };
    for (const [, section] of this.sections) stopWatch(section.watchId, unwatchApi);
    this.sections.clear();
    this.termCwds.clear();
  }
}

registerComponent('FileTree', FileTree);
