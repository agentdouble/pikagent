import { emitFileOpen } from '../utils/workspace-events.js';
import { _el } from '../utils/file-dom.js';
import { onClickStopped } from '../utils/event-helpers.js';
import { STATUS_LABELS, CHEVRON, CHANGE_SECTIONS, computeTotalChanges, buildFileKey } from '../utils/git-changes-helpers.js';
import { registerComponent, getComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import gitApi from '../services/git-api.js';

export class GitChangesView extends ComponentBase {
  constructor(container) {
    super(container);
    this.gitCwd = null;
    this.expandedFile = null;
  }

  setCwd(cwd) {
    this.gitCwd = cwd;
  }

  dispose() {
    super.dispose();
    this.container.replaceChildren();
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

    const changes = await gitApi.localChanges(this.gitCwd);
    this._renderChanges(changes);
  }

  _createHeader(total) {
    return _el('div', { className: 'git-header' },
      _el('span', { textContent: `Local Changes (${total})` }),
      _el('span', { className: 'git-refresh-btn', textContent: '↻', title: 'Refresh', onClick: () => this.loadChanges() }),
    );
  }

  _renderChanges(changes) {
    const total = computeTotalChanges(changes);

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
    const key = buildFileKey(file.path, isStaged);
    const isExpanded = this.expandedFile === key;

    const openBtn = _el('span', { className: 'git-open-btn', textContent: '→', title: 'Open file' });
    onClickStopped(openBtn, () => {
      /** @fires file:open {{ path: string, name: string }} */
      emitFileOpen({ path: `${this.gitCwd}/${file.path}`, name: file.path.split('/').pop() });
    });

    const row = _el('div', { className: 'git-file-item', onClick: () => {
      this.expandedFile = this.expandedFile === key ? null : key;
      this.loadChanges();
    }},
      _el('span', 'git-chevron', isExpanded ? CHEVRON.expanded : CHEVRON.collapsed),
      _el('span', `git-file-status git-status-${file.status}`, STATUS_LABELS[file.status] || file.status),
      _el('span', { className: 'git-file-name-label', textContent: file.path, title: file.path }),
      openBtn,
    );

    const item = _el('div', 'git-file-row', row);

    if (isExpanded && file.status !== '?') {
      const diffContainer = _el('div', 'git-diff-container',
        _el('div', 'git-loading', 'Loading diff...'),
      );
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
    const diff = await gitApi.fileDiff(this.gitCwd, filePath, isStaged);

    if (!diff) {
      this._setContent(container, _el('div', { className: 'git-empty', textContent: 'No diff available', style: { height: 'auto', padding: '8px' } }));
      return;
    }

    this._setContent(container);
    const DiffViewer = getComponent('DiffViewer');
    new DiffViewer(container, diff, filePath);
  }
}

registerComponent('GitChangesView', GitChangesView);
