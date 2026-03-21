import { bus } from '../utils/events.js';
import { contextMenu } from './context-menu.js';

const INDENT_BASE = 12;
const INDENT_STEP = 16;
const CHEVRON_EXPANDED = '▾';
const CHEVRON_COLLAPSED = '▸';
const DEBOUNCE_DELAY = 400;
const WATCH_PREFIX = 'watch_';

const SVG_NEW_FILE = '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M11.5 1H4.5C3.67 1 3 1.67 3 2.5v11c0 .83.67 1.5 1.5 1.5h7c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zM7 4h2v2.5h2.5v2H9V11H7V8.5H4.5v-2H7V4z"/></svg>';
const SVG_NEW_FOLDER = '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M14 4H8.72l-1.5-1.5H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1zm-3 5.5h-1.5V11h-1V9.5H7v-1h1.5V7h1v1.5H11v1z"/></svg>';
const SVG_REFRESH = '<svg width="14" height="14" viewBox="0 0 16 16"><path fill="currentColor" d="M13.45 5.17A6 6 0 0 0 2.55 5.17L1 3.62V8h4.38L3.72 6.34a4.5 4.5 0 1 1-.34 4.83l-1.36.78A6 6 0 1 0 13.45 5.17z"/></svg>';

export class FileTree {
  constructor(container) {
    this.container = container;
    this.termCwds = new Map();  // termId -> cwd
    this.sections = new Map();  // cwd -> { termIds: Set, sectionEl, expandedDirs, watchId }
    this.debounceTimers = new Map();
    this.render();
    this.listenForChanges();
  }

  render() {
    this.container.innerHTML = '';
    this.treeEl = document.createElement('div');
    this.treeEl.className = 'file-tree-content';
    this.container.appendChild(this.treeEl);

    // Global drop fallback on the container (drops into root of first section)
    this._setupDropZone(this.container, () => {
      const firstCwd = this.sections.keys().next().value;
      return firstCwd || null;
    });
  }

  listenForChanges() {
    this.unsubFs = window.api.fs.onChanged(({ id }) => {
      // id is the watchId, which is the cwd string
      if (this.debounceTimers.has(id)) {
        clearTimeout(this.debounceTimers.get(id));
      }
      this.debounceTimers.set(
        id,
        setTimeout(() => {
          this.debounceTimers.delete(id);
          this.refreshSection(id);
        }, DEBOUNCE_DELAY)
      );
    });
  }

  async setTerminalRoot(termId, dirPath) {
    const prevCwd = this.termCwds.get(termId);
    if (prevCwd === dirPath) return;

    // Remove from previous section if exists
    if (prevCwd) {
      this._removeTermFromSection(termId, prevCwd);
    }

    this.termCwds.set(termId, dirPath);

    // Add to existing section or create new one
    const existing = this.sections.get(dirPath);
    if (existing) {
      existing.termIds.add(termId);
      // Section already visible, nothing to do
      return;
    }

    // Create new section
    const sectionEl = document.createElement('div');
    sectionEl.className = 'file-tree-section';
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
      // No terminals left for this cwd — remove section entirely
      window.api.fs.unwatch(section.watchId);
      section.sectionEl.remove();
      this.sections.delete(cwd);
    }
  }

  async refreshSection(watchIdOrCwd) {
    // watchId format is "watch_/path/to/dir", cwd is just "/path/to/dir"
    let cwd = watchIdOrCwd;
    if (cwd.startsWith(WATCH_PREFIX)) {
      cwd = cwd.slice(WATCH_PREFIX.length);
    }
    const section = this.sections.get(cwd);
    if (!section) return;

    const wasCollapsed =
      section.sectionEl.querySelector('.file-tree-section-content.collapsed') !== null;

    section.sectionEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'file-tree-section-header';

    const folderName = cwd.split('/').filter(Boolean).pop() || '/';

    const chevron = document.createElement('span');
    chevron.className = 'file-tree-section-chevron';
    chevron.textContent = wasCollapsed ? CHEVRON_COLLAPSED : CHEVRON_EXPANDED;

    const label = document.createElement('span');
    label.className = 'file-tree-section-label';
    label.textContent = folderName;
    label.title = cwd;

    const actions = document.createElement('div');
    actions.className = 'file-tree-section-actions';

    const btnNewFile = document.createElement('button');
    btnNewFile.className = 'file-tree-action-btn';
    btnNewFile.title = 'New File';
    btnNewFile.innerHTML = SVG_NEW_FILE;
    btnNewFile.addEventListener('click', (e) => {
      e.stopPropagation();
      this.promptNewEntry(cwd, contentEl, 0, section.expandedDirs, 'file');
    });

    const btnNewFolder = document.createElement('button');
    btnNewFolder.className = 'file-tree-action-btn';
    btnNewFolder.title = 'New Folder';
    btnNewFolder.innerHTML = SVG_NEW_FOLDER;
    btnNewFolder.addEventListener('click', (e) => {
      e.stopPropagation();
      this.promptNewEntry(cwd, contentEl, 0, section.expandedDirs, 'folder');
    });

    const btnRefresh = document.createElement('button');
    btnRefresh.className = 'file-tree-action-btn';
    btnRefresh.title = 'Refresh';
    btnRefresh.innerHTML = SVG_REFRESH;
    btnRefresh.addEventListener('click', (e) => {
      e.stopPropagation();
      this.refreshSection(cwd);
    });

    actions.appendChild(btnNewFile);
    actions.appendChild(btnNewFolder);
    actions.appendChild(btnRefresh);

    header.appendChild(chevron);
    header.appendChild(label);
    header.appendChild(actions);
    section.sectionEl.appendChild(header);

    const contentEl = document.createElement('div');
    contentEl.className = 'file-tree-section-content';
    if (wasCollapsed) contentEl.classList.add('collapsed');
    section.sectionEl.appendChild(contentEl);

    header.addEventListener('click', () => {
      const collapsed = contentEl.classList.toggle('collapsed');
      chevron.textContent = collapsed ? CHEVRON_COLLAPSED : CHEVRON_EXPANDED;
    });

    // Context menu on section header (root folder)
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showDirContextMenu(e.clientX, e.clientY, cwd, cwd, contentEl, 0, section.expandedDirs);
    });

    // Drop on section header → drop into root cwd
    this._setupDropZone(header, cwd);
    // Drop on section content area (empty space) → drop into root cwd
    this._setupDropZone(contentEl, cwd);

    await this.renderDir(cwd, contentEl, 0, section.expandedDirs);
  }

  // --- Context menus ---

  getRelativePath(fullPath, rootCwd) {
    if (fullPath.startsWith(rootCwd)) {
      const rel = fullPath.slice(rootCwd.length);
      return rel.startsWith('/') ? rel.slice(1) : rel;
    }
    return fullPath;
  }

  findRootCwd(entryPath) {
    for (const [cwd] of this.sections) {
      if (entryPath.startsWith(cwd)) return cwd;
    }
    return '';
  }

  _commonContextItems(entryPath, nameEl, deleteLabel) {
    const rootCwd = this.findRootCwd(entryPath);
    const displayName = entryPath.split('/').pop();
    return [
      { label: 'Rename', action: () => this.promptRename(entryPath, nameEl) },
      { separator: true },
      { label: 'Copy Path', action: () => window.api.clipboard.write(entryPath) },
      { label: 'Copy Relative Path', action: () => window.api.clipboard.write(this.getRelativePath(entryPath, rootCwd)) },
      { separator: true },
      { label: 'Duplicate', action: () => window.api.fs.copy(entryPath) },
      { label: 'Reveal in Finder', action: () => window.api.shell.showInFolder(entryPath) },
      { separator: true },
      {
        label: 'Delete',
        action: () => {
          if (confirm(deleteLabel || `Delete "${displayName}"?`)) {
            window.api.fs.trash(entryPath);
          }
        },
      },
    ];
  }

  showFileContextMenu(x, y, entryPath, nameEl) {
    contextMenu.show(x, y, this._commonContextItems(entryPath, nameEl));
  }

  showDirContextMenu(x, y, dirPath, rootCwd, contentEl, depth, expandedDirs, nameEl) {
    const dirName = dirPath.split('/').pop();
    contextMenu.show(x, y, [
      { label: 'New File', action: () => this.promptNewEntry(dirPath, contentEl, depth, expandedDirs, 'file') },
      { label: 'New Folder', action: () => this.promptNewEntry(dirPath, contentEl, depth, expandedDirs, 'folder') },
      { separator: true },
      ...this._commonContextItems(dirPath, nameEl, `Delete folder "${dirName}" and all its contents?`),
    ]);
  }

  // --- Inline input helper ---

  _setupInlineInput(input, { onCommit, onCancel }) {
    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      onCommit(input.value.trim());
    };
    const cancel = () => {
      committed = true;
      if (onCancel) onCancel();
      else input.remove();
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
      if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
    });
    input.addEventListener('blur', () => {
      setTimeout(() => { if (!committed) commit(); }, 100);
    });
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  // --- Rename inline input ---

  promptRename(entryPath, nameEl) {
    const oldName = entryPath.split('/').pop();
    const input = document.createElement('input');
    input.className = 'file-tree-rename-input';
    input.type = 'text';
    input.value = oldName;

    nameEl.style.display = 'none';
    nameEl.parentElement.appendChild(input);
    input.focus();
    const dotIndex = oldName.lastIndexOf('.');
    input.setSelectionRange(0, dotIndex > 0 ? dotIndex : oldName.length);

    this._setupInlineInput(input, {
      onCommit: async (newName) => {
        input.remove();
        nameEl.style.display = '';
        if (!newName || newName === oldName) return;
        await window.api.fs.rename(entryPath, newName);
      },
      onCancel: () => {
        input.remove();
        nameEl.style.display = '';
      },
    });
  }

  // --- New File / Folder inline input ---

  promptNewEntry(dirPath, parentContentEl, depth, expandedDirs, type) {
    const input = document.createElement('input');
    input.className = 'file-tree-new-input';
    input.type = 'text';
    input.placeholder = type === 'folder' ? 'folder name' : 'filename';
    input.style.marginLeft = `${INDENT_BASE + (depth + 1) * INDENT_STEP}px`;

    parentContentEl.prepend(input);
    input.focus();

    this._setupInlineInput(input, {
      onCommit: async (name) => {
        input.remove();
        if (!name) return;
        const newPath = dirPath + '/' + name;
        if (type === 'folder') {
          await window.api.fs.mkdir(newPath);
        } else {
          await window.api.fs.writefile(newPath, '');
          bus.emit('file:open', { path: newPath, name });
        }
      },
    });
  }

  // --- Drag & Drop from external (Finder, etc.) ---

  _setupDropZone(el, getTargetDir) {
    el.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      el.classList.add('drop-target');
    });

    el.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      el.classList.remove('drop-target');
    });

    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      el.classList.remove('drop-target');
      const targetDir = typeof getTargetDir === 'function' ? getTargetDir() : getTargetDir;
      if (!targetDir) return;
      await this._handleFileDrop(e.dataTransfer.files, targetDir);
    });
  }

  async _handleFileDrop(files, destDir) {
    for (const file of files) {
      if (file.path) {
        await window.api.fs.copyTo(file.path, destDir);
      }
    }
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
    childContainer.innerHTML = '';
    chevron.textContent = CHEVRON_COLLAPSED;
    chevron.classList.remove('expanded');
  }

  // --- Render directory entries ---

  async renderDir(dirPath, parentEl, depth, expandedDirs) {
    const entries = await window.api.fs.readdir(dirPath);

    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'file-tree-item';
      row.style.paddingLeft = `${INDENT_BASE + depth * INDENT_STEP}px`;

      const chevron = document.createElement('span');
      chevron.className = 'file-tree-chevron';

      if (entry.isDirectory) {
        const isExpanded = expandedDirs.has(entry.path);
        chevron.textContent = isExpanded ? CHEVRON_EXPANDED : CHEVRON_COLLAPSED;
        chevron.classList.toggle('expanded', isExpanded);
      }

      const name = document.createElement('span');
      name.className = 'file-tree-name';
      name.textContent = entry.name;

      row.appendChild(chevron);
      row.appendChild(name);
      parentEl.appendChild(row);

      if (entry.isDirectory) {
        const childContainer = document.createElement('div');
        childContainer.className = 'file-tree-children';
        parentEl.appendChild(childContainer);

        if (expandedDirs.has(entry.path)) {
          await this.renderDir(entry.path, childContainer, depth + 1, expandedDirs);
        }

        // Drop on directory row → drop into that directory
        this._setupDropZone(row, entry.path);

        row.addEventListener('click', async () => {
          if (expandedDirs.has(entry.path)) {
            this._collapseDir(entry.path, childContainer, chevron, expandedDirs);
          } else {
            await this._expandDir(entry.path, childContainer, chevron, depth, expandedDirs);
          }
        });

        // Right-click on directory
        row.addEventListener('contextmenu', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Auto-expand the dir so the new file input goes inside
          if (!expandedDirs.has(entry.path)) {
            await this._expandDir(entry.path, childContainer, chevron, depth, expandedDirs);
          }
          this.showDirContextMenu(e.clientX, e.clientY, entry.path, this.findRootCwd(entry.path), childContainer, depth + 1, expandedDirs, name);
        });
      } else {
        row.addEventListener('click', () => {
          this.container.querySelectorAll('.file-tree-item.active').forEach((el) => {
            el.classList.remove('active');
          });
          row.classList.add('active');
          bus.emit('file:open', { path: entry.path, name: entry.name });
        });

        // Right-click on file
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.showFileContextMenu(e.clientX, e.clientY, entry.path, name);
        });
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
