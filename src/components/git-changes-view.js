import { bus } from '../utils/events.js';
import { DiffViewer } from './diff-viewer.js';

const STATUS_LABELS = { M: 'M', A: 'A', D: 'D', R: 'R', '?': '?' };

export class GitChangesView {
  constructor(container) {
    this.container = container;
    this.gitCwd = null;
    this.expandedFile = null;
  }

  setCwd(cwd) {
    this.gitCwd = cwd;
  }

  _el(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
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

  _createHeader(total) {
    const header = this._el('div', 'git-header');
    header.appendChild(this._el('span', null, `Local Changes (${total})`));
    const refreshBtn = this._el('span', 'git-refresh-btn', '↻');
    refreshBtn.title = 'Refresh';
    refreshBtn.addEventListener('click', () => this.loadChanges());
    header.appendChild(refreshBtn);
    return header;
  }

  _renderChanges(changes) {
    this.container.innerHTML = '';
    const { staged, unstaged, untracked } = changes;
    const total = staged.length + unstaged.length + untracked.length;

    if (total === 0) {
      this.container.innerHTML = '<div class="git-empty">No local changes</div>';
      return;
    }

    this.container.appendChild(this._createHeader(total));

    const list = this._el('div', 'git-commit-list');
    const sections = [
      { title: 'Staged', files: staged, isStaged: true },
      { title: 'Modified', files: unstaged, isStaged: false },
      { title: 'Untracked', files: untracked, isStaged: false },
    ];
    for (const { title, files, isStaged } of sections) {
      if (files.length > 0) this._renderSection(list, title, files, isStaged);
    }
    this.container.appendChild(list);
  }

  _createFileItem(file, isStaged) {
    const key = `${isStaged ? 's' : 'u'}:${file.path}`;
    const isExpanded = this.expandedFile === key;

    const item = this._el('div', 'git-file-row');

    const row = this._el('div', 'git-file-item');
    row.addEventListener('click', () => {
      this.expandedFile = this.expandedFile === key ? null : key;
      this.loadChanges();
    });

    row.appendChild(this._el('span', 'git-chevron', isExpanded ? '▼' : '▶'));
    row.appendChild(this._el('span', `git-file-status git-status-${file.status}`, STATUS_LABELS[file.status] || file.status));

    const fileName = this._el('span', 'git-file-name-label', file.path);
    fileName.title = file.path;
    row.appendChild(fileName);

    const openBtn = this._el('span', 'git-open-btn', '→');
    openBtn.title = 'Open file';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bus.emit('file:open', { path: `${this.gitCwd}/${file.path}`, name: file.path.split('/').pop() });
    });
    row.appendChild(openBtn);

    item.appendChild(row);

    if (isExpanded && file.status !== '?') {
      const diffContainer = this._el('div', 'git-diff-container');
      diffContainer.innerHTML = '<div class="git-loading">Loading diff...</div>';
      item.appendChild(diffContainer);
      this._loadFileDiff(file.path, isStaged, diffContainer);
    }

    return item;
  }

  _renderSection(container, title, files, isStaged) {
    const section = this._el('div', 'git-section');
    section.appendChild(this._el('div', 'git-section-header', `${title} (${files.length})`));

    for (const file of files) {
      section.appendChild(this._createFileItem(file, isStaged));
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
