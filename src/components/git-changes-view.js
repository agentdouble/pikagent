import { bus } from '../utils/events.js';
import { DiffViewer } from './diff-viewer.js';
import { _el } from '../utils/dom.js';

const STATUS_LABELS = { M: 'M', A: 'A', D: 'D', R: 'R', '?': '?' };

const CHEVRON = { expanded: '▼', collapsed: '▶' };

const CHANGE_SECTIONS = [
  { key: 'staged', title: 'Staged', isStaged: true },
  { key: 'unstaged', title: 'Modified', isStaged: false },
  { key: 'untracked', title: 'Untracked', isStaged: false },
];

export class GitChangesView {
  constructor(container) {
    this.container = container;
    this.gitCwd = null;
    this.expandedFile = null;
  }

  setCwd(cwd) {
    this.gitCwd = cwd;
  }

  _setContent(parent, ...children) {
    parent.replaceChildren(...children);
  }

  _renderMessage(parent, cls, text) {
    this._setContent(parent, _el('div', cls, text));
  }

  async loadChanges() {
    if (!this.gitCwd) {
      const pathEl = document.querySelector('.path-text');
      if (pathEl) this.gitCwd = pathEl.textContent;
    }

    if (!this.gitCwd) {
      this._renderMessage(this.container, 'git-empty', 'No working directory detected');
      return;
    }

    this._renderMessage(this.container, 'git-loading', 'Loading changes...');

    const changes = await window.api.git.localChanges(this.gitCwd);
    this._renderChanges(changes);
  }

  _createHeader(total) {
    const refreshBtn = _el('span', 'git-refresh-btn', '↻');
    refreshBtn.title = 'Refresh';
    refreshBtn.addEventListener('click', () => this.loadChanges());

    const header = _el('div', 'git-header');
    header.append(
      _el('span', null, `Local Changes (${total})`),
      refreshBtn,
    );
    return header;
  }

  _renderChanges(changes) {
    const total = CHANGE_SECTIONS.reduce((sum, s) => sum + (changes[s.key]?.length || 0), 0);

    if (total === 0) {
      this._renderMessage(this.container, 'git-empty', 'No local changes');
      return;
    }

    const list = _el('div', 'git-commit-list');
    for (const { key, title, isStaged } of CHANGE_SECTIONS) {
      const files = changes[key];
      if (files?.length > 0) this._renderSection(list, title, files, isStaged);
    }

    this._setContent(this.container, this._createHeader(total), list);
  }

  _createFileItem(file, isStaged) {
    const key = `${isStaged ? 's' : 'u'}:${file.path}`;
    const isExpanded = this.expandedFile === key;

    const item = _el('div', 'git-file-row');

    const row = _el('div', 'git-file-item');
    row.addEventListener('click', () => {
      this.expandedFile = this.expandedFile === key ? null : key;
      this.loadChanges();
    });

    const fileName = _el('span', 'git-file-name-label', file.path);
    fileName.title = file.path;

    const openBtn = _el('span', 'git-open-btn', '→');
    openBtn.title = 'Open file';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bus.emit('file:open', { path: `${this.gitCwd}/${file.path}`, name: file.path.split('/').pop() });
    });

    row.append(
      _el('span', 'git-chevron', isExpanded ? CHEVRON.expanded : CHEVRON.collapsed),
      _el('span', `git-file-status git-status-${file.status}`, STATUS_LABELS[file.status] || file.status),
      fileName,
      openBtn,
    );

    item.appendChild(row);

    if (isExpanded && file.status !== '?') {
      const diffContainer = _el('div', 'git-diff-container');
      diffContainer.appendChild(_el('div', 'git-loading', 'Loading diff...'));
      item.appendChild(diffContainer);
      this._loadFileDiff(file.path, isStaged, diffContainer);
    }

    return item;
  }

  _renderSection(container, title, files, isStaged) {
    const section = _el('div', 'git-section');
    section.appendChild(_el('div', 'git-section-header', `${title} (${files.length})`));

    for (const file of files) {
      section.appendChild(this._createFileItem(file, isStaged));
    }

    container.appendChild(section);
  }

  async _loadFileDiff(filePath, isStaged, container) {
    const diff = await window.api.git.fileDiff(this.gitCwd, filePath, isStaged);

    if (!diff) {
      const msg = _el('div', 'git-empty', 'No diff available');
      msg.style.height = 'auto';
      msg.style.padding = '8px';
      this._setContent(container, msg);
      return;
    }

    this._setContent(container);
    new DiffViewer(container, diff, filePath);
  }
}
