import { getFileIcon } from '../utils/file-icons.js';
import { bus } from '../utils/events.js';
import { contextMenu } from './context-menu.js';

export class FileTree {
  constructor(container) {
    this.container = container;
    this.roots = new Map(); // termId -> { cwd, sectionEl, expandedDirs }
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
    const existing = this.roots.get(termId);
    if (existing && existing.cwd === dirPath) return;

    window.api.fs.unwatch(termId);

    if (existing) {
      existing.cwd = dirPath;
      existing.expandedDirs.clear();
      existing.expandedDirs.add(dirPath);
      await this.refreshSection(termId);
    } else {
      const sectionEl = document.createElement('div');
      sectionEl.className = 'file-tree-section';
      const expandedDirs = new Set([dirPath]);
      this.roots.set(termId, { cwd: dirPath, sectionEl, expandedDirs });
      this.treeEl.appendChild(sectionEl);
      await this.refreshSection(termId);
    }

    window.api.fs.watch(termId, dirPath);
  }

  removeTerminal(termId) {
    window.api.fs.unwatch(termId);
    const root = this.roots.get(termId);
    if (!root) return;
    root.sectionEl.remove();
    this.roots.delete(termId);
  }

  async refreshSection(termId) {
    const root = this.roots.get(termId);
    if (!root) return;

    const wasCollapsed =
      root.sectionEl.querySelector('.file-tree-section-content.collapsed') !== null;

    root.sectionEl.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'file-tree-section-header';

    const folderName = root.cwd.split('/').filter(Boolean).pop() || '/';

    const chevron = document.createElement('span');
    chevron.className = 'file-tree-section-chevron';
    chevron.textContent = wasCollapsed ? '▸' : '▾';

    const label = document.createElement('span');
    label.className = 'file-tree-section-label';
    label.textContent = folderName;
    label.title = root.cwd;

    header.appendChild(chevron);
    header.appendChild(label);
    root.sectionEl.appendChild(header);

    const contentEl = document.createElement('div');
    contentEl.className = 'file-tree-section-content';
    if (wasCollapsed) contentEl.classList.add('collapsed');
    root.sectionEl.appendChild(contentEl);

    header.addEventListener('click', () => {
      const collapsed = contentEl.classList.toggle('collapsed');
      chevron.textContent = collapsed ? '▸' : '▾';
    });

    // Context menu on section header (root folder)
    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showDirContextMenu(e.clientX, e.clientY, root.cwd, root.cwd, contentEl, 0, root.expandedDirs);
    });

    await this.renderDir(root.cwd, contentEl, 0, root.expandedDirs);
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
    for (const [, root] of this.roots) {
      if (entryPath.startsWith(root.cwd)) return root.cwd;
    }
    return '';
  }

  showFileContextMenu(x, y, entryPath) {
    const rootCwd = this.findRootCwd(entryPath);
    const fileName = entryPath.split('/').pop();
    contextMenu.show(x, y, [
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

  showDirContextMenu(x, y, dirPath, rootCwd, contentEl, depth, expandedDirs) {
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

      const icon = document.createElement('span');
      icon.className = 'file-tree-icon';
      icon.textContent = getFileIcon(entry.name, entry.isDirectory);

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
      row.appendChild(icon);
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
              this.showDirContextMenu(e.clientX, e.clientY, entry.path, this.findRootCwd(entry.path), childContainer, depth + 1, expandedDirs);
            });
          } else {
            this.showDirContextMenu(e.clientX, e.clientY, entry.path, this.findRootCwd(entry.path), childContainer, depth + 1, expandedDirs);
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
          this.showFileContextMenu(e.clientX, e.clientY, entry.path);
        });
      }
    }
  }

  dispose() {
    if (this.unsubFs) this.unsubFs();
    for (const [termId] of this.roots) {
      window.api.fs.unwatch(termId);
    }
    this.roots.clear();
  }
}
