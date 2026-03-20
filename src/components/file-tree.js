import { bus } from '../utils/events.js';
import { contextMenu } from './context-menu.js';

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
        }, 400)
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
    const watchId = `watch_${dirPath}`;
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
    if (cwd.startsWith('watch_')) {
      cwd = cwd.slice(6);
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
    chevron.textContent = wasCollapsed ? '▸' : '▾';

    const label = document.createElement('span');
    label.className = 'file-tree-section-label';
    label.textContent = folderName;
    label.title = cwd;

    header.appendChild(chevron);
    header.appendChild(label);
    section.sectionEl.appendChild(header);

    const contentEl = document.createElement('div');
    contentEl.className = 'file-tree-section-content';
    if (wasCollapsed) contentEl.classList.add('collapsed');
    section.sectionEl.appendChild(contentEl);

    header.addEventListener('click', () => {
      const collapsed = contentEl.classList.toggle('collapsed');
      chevron.textContent = collapsed ? '▸' : '▾';
    });

    // Context menu on section header (root folder)
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showDirContextMenu(e.clientX, e.clientY, cwd, cwd, contentEl, 0, section.expandedDirs);
    });

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

  showFileContextMenu(x, y, entryPath, nameEl) {
    const rootCwd = this.findRootCwd(entryPath);
    const fileName = entryPath.split('/').pop();
    contextMenu.show(x, y, [
      {
        label: 'Rename',
        action: () => this.promptRename(entryPath, nameEl),
      },
      { separator: true },
      {
        label: 'Copy Path',
        action: () => window.api.clipboard.write(entryPath),
      },
      {
        label: 'Copy Relative Path',
        action: () => window.api.clipboard.write(this.getRelativePath(entryPath, rootCwd)),
      },
      { separator: true },
      {
        label: 'Duplicate',
        action: () => window.api.fs.copy(entryPath),
      },
      {
        label: 'Reveal in Finder',
        action: () => window.api.shell.showInFolder(entryPath),
      },
      { separator: true },
      {
        label: 'Delete',
        action: () => {
          if (confirm(`Delete "${fileName}"?`)) {
            window.api.fs.trash(entryPath);
          }
        },
      },
    ]);
  }

  showDirContextMenu(x, y, dirPath, rootCwd, contentEl, depth, expandedDirs, nameEl) {
    contextMenu.show(x, y, [
      {
        label: 'New File',
        action: () => this.promptNewEntry(dirPath, contentEl, depth, expandedDirs, 'file'),
      },
      {
        label: 'New Folder',
        action: () => this.promptNewEntry(dirPath, contentEl, depth, expandedDirs, 'folder'),
      },
      { separator: true },
      {
        label: 'Rename',
        action: () => this.promptRename(dirPath, nameEl),
      },
      { separator: true },
      {
        label: 'Copy Path',
        action: () => window.api.clipboard.write(dirPath),
      },
      {
        label: 'Copy Relative Path',
        action: () =>
          window.api.clipboard.write(this.getRelativePath(dirPath, this.findRootCwd(dirPath))),
      },
      { separator: true },
      {
        label: 'Duplicate',
        action: () => window.api.fs.copy(dirPath),
      },
      {
        label: 'Reveal in Finder',
        action: () => window.api.shell.showInFolder(dirPath),
      },
      { separator: true },
      {
        label: 'Delete',
        action: () => {
          const folderName = dirPath.split('/').pop();
          if (confirm(`Delete folder "${folderName}" and all its contents?`)) {
            window.api.fs.trash(dirPath);
          }
        },
      },
    ]);
  }

  // --- Rename inline input ---

  promptRename(entryPath, nameEl) {
    const oldName = entryPath.split('/').pop();
    const input = document.createElement('input');
    input.className = 'file-tree-rename-input';
    input.type = 'text';
    input.value = oldName;

    // Replace the name span with the input
    nameEl.style.display = 'none';
    nameEl.parentElement.appendChild(input);
    input.focus();
    // Select name without extension for files
    const dotIndex = oldName.lastIndexOf('.');
    input.setSelectionRange(0, dotIndex > 0 ? dotIndex : oldName.length);

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const newName = input.value.trim();
      input.remove();
      nameEl.style.display = '';
      if (!newName || newName === oldName) return;
      await window.api.fs.rename(entryPath, newName);
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        commit();
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        committed = true;
        input.remove();
        nameEl.style.display = '';
      }
    });

    input.addEventListener('blur', () => {
      setTimeout(() => { if (!committed) commit(); }, 100);
    });

    // Prevent row click from firing while renaming
    input.addEventListener('click', (e) => e.stopPropagation());
  }

  // --- New File / Folder inline input ---

  promptNewEntry(dirPath, parentContentEl, depth, expandedDirs, type) {
    const input = document.createElement('input');
    input.className = 'file-tree-new-input';
    input.type = 'text';
    input.placeholder = type === 'folder' ? 'folder name' : 'filename';
    input.style.marginLeft = `${12 + (depth + 1) * 16}px`;

    parentContentEl.prepend(input);
    input.focus();

    const commit = async () => {
      const name = input.value.trim();
      input.remove();
      if (!name) return;

      const newPath = dirPath + '/' + name;
      if (type === 'folder') {
        await window.api.fs.mkdir(newPath);
      } else {
        await window.api.fs.writefile(newPath, '');
        bus.emit('file:open', { path: newPath, name });
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') {
        input.remove();
      }
    });

    input.addEventListener('blur', () => {
      // Small delay so Enter can fire first
      setTimeout(() => { if (input.parentElement) input.remove(); }, 100);
    });
  }

  // --- Render directory entries ---

  async renderDir(dirPath, parentEl, depth, expandedDirs) {
    const entries = await window.api.fs.readdir(dirPath);

    for (const entry of entries) {
      const row = document.createElement('div');
      row.className = 'file-tree-item';
      row.style.paddingLeft = `${12 + depth * 16}px`;

      const chevron = document.createElement('span');
      chevron.className = 'file-tree-chevron';

      if (entry.isDirectory) {
        const isExpanded = expandedDirs.has(entry.path);
        chevron.textContent = isExpanded ? '▾' : '▸';
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

        row.addEventListener('click', async () => {
          if (expandedDirs.has(entry.path)) {
            expandedDirs.delete(entry.path);
            childContainer.innerHTML = '';
            chevron.textContent = '▸';
            chevron.classList.remove('expanded');
          } else {
            expandedDirs.add(entry.path);
            chevron.textContent = '▾';
            chevron.classList.add('expanded');
            await this.renderDir(entry.path, childContainer, depth + 1, expandedDirs);
          }
        });

        // Right-click on directory
        row.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // Auto-expand the dir so the new file input goes inside
          if (!expandedDirs.has(entry.path)) {
            expandedDirs.add(entry.path);
            chevron.textContent = '▾';
            chevron.classList.add('expanded');
            this.renderDir(entry.path, childContainer, depth + 1, expandedDirs).then(() => {
              this.showDirContextMenu(e.clientX, e.clientY, entry.path, this.findRootCwd(entry.path), childContainer, depth + 1, expandedDirs, name);
            });
          } else {
            this.showDirContextMenu(e.clientX, e.clientY, entry.path, this.findRootCwd(entry.path), childContainer, depth + 1, expandedDirs, name);
          }
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
