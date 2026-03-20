import { bus } from '../utils/events.js';
import { DiffViewer } from './diff-viewer.js';

export class GitChangesView {
  constructor(container) {
    this.container = container;
    this.gitCwd = null;
    this.expandedFile = null;
  }

  setCwd(cwd) {
    this.gitCwd = cwd;
  }

  async loadChanges() {
    if (!this.gitCwd) {
      const pathEl = document.querySelector('.path-text');
      if (pathEl) this.gitCwd = pathEl.textContent;
    }

    if (!this.gitCwd) {
      this.container.innerHTML = '<div class="git-empty">No working directory detected</div>';
      return;
    }

    this.container.innerHTML = '<div class="git-loading">Loading changes...</div>';

    const changes = await window.api.git.localChanges(this.gitCwd);
    this._renderChanges(changes);
  }

  _renderChanges(changes) {
    this.container.innerHTML = '';
    const { staged, unstaged, untracked } = changes;
    const total = staged.length + unstaged.length + untracked.length;

    if (total === 0) {
      this.container.innerHTML = '<div class="git-empty">No local changes</div>';
      return;
    }

    // Refresh button
    const header = document.createElement('div');
    header.className = 'git-header';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = `Local Changes (${total})`;
    const refreshBtn = document.createElement('span');
    refreshBtn.className = 'git-refresh-btn';
    refreshBtn.textContent = '↻';
    refreshBtn.title = 'Refresh';
    refreshBtn.addEventListener('click', () => this.loadChanges());
    header.appendChild(titleSpan);
    header.appendChild(refreshBtn);
    this.container.appendChild(header);

    const list = document.createElement('div');
    list.className = 'git-commit-list';

    if (staged.length > 0) {
      this._renderSection(list, 'Staged', staged, true);
    }
    if (unstaged.length > 0) {
      this._renderSection(list, 'Modified', unstaged, false);
    }
    if (untracked.length > 0) {
      this._renderSection(list, 'Untracked', untracked, false);
    }

    this.container.appendChild(list);
  }

  _renderSection(container, title, files, isStaged) {
    const section = document.createElement('div');
    section.className = 'git-section';

    const sectionHeader = document.createElement('div');
    sectionHeader.className = 'git-section-header';
    sectionHeader.textContent = `${title} (${files.length})`;
    section.appendChild(sectionHeader);

    for (const file of files) {
      const key = `${isStaged ? 's' : 'u'}:${file.path}`;

      const item = document.createElement('div');
      item.className = 'git-file-row';

      const row = document.createElement('div');
      row.className = 'git-file-item';
      row.addEventListener('click', () => {
        this.expandedFile = this.expandedFile === key ? null : key;
        this.loadChanges();
      });

      const chevron = document.createElement('span');
      chevron.className = 'git-chevron';
      chevron.textContent = this.expandedFile === key ? '▼' : '▶';

      const statusBadge = document.createElement('span');
      statusBadge.className = `git-file-status git-status-${file.status}`;
      const statusLabels = { M: 'M', A: 'A', D: 'D', R: 'R', '?': '?' };
      statusBadge.textContent = statusLabels[file.status] || file.status;

      const fileName = document.createElement('span');
      fileName.className = 'git-file-name-label';
      fileName.textContent = file.path;
      fileName.title = file.path;

      const openBtn = document.createElement('span');
      openBtn.className = 'git-open-btn';
      openBtn.textContent = '→';
      openBtn.title = 'Open file';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fullPath = this.gitCwd + '/' + file.path;
        bus.emit('file:open', { path: fullPath, name: file.path.split('/').pop() });
      });

      row.appendChild(chevron);
      row.appendChild(statusBadge);
      row.appendChild(fileName);
      row.appendChild(openBtn);
      item.appendChild(row);

      // Expanded diff
      if (this.expandedFile === key && file.status !== '?') {
        const diffContainer = document.createElement('div');
        diffContainer.className = 'git-diff-container';
        diffContainer.innerHTML = '<div class="git-loading">Loading diff...</div>';
        item.appendChild(diffContainer);
        this._loadFileDiff(file.path, isStaged, diffContainer);
      }

      section.appendChild(item);
    }

    container.appendChild(section);
  }

  async _loadFileDiff(filePath, isStaged, container) {
    const diff = await window.api.git.fileDiff(this.gitCwd, filePath, isStaged);
    container.innerHTML = '';

    if (!diff) {
      container.innerHTML = '<div class="git-empty" style="height:auto;padding:8px">No diff available</div>';
      return;
    }

    new DiffViewer(container, diff, filePath);
  }
}
