import { detectLanguage } from '../utils/file-icons.js';
import { _el } from '../utils/dom-dialogs.js';
import { parseDiff, buildSideBySideRows, wordDiff, countDiffStats, UNIFIED_CHANGE_CONFIG, VIEW_MODES, HUNK_FLASH_DURATION_MS } from '../utils/diff-parser.js';
import { NAV_BUTTONS, WORD_DIFF_CLASS, capitalize } from '../utils/diff-viewer-helpers.js';
import { registerComponent } from '../utils/component-registry.js';

/**
 * DiffViewer component - renders a side-by-side diff with syntax highlighting,
 * line numbers, and navigation between hunks.
 */
export class DiffViewer {
  constructor(container, diffText, filePath) {
    this.container = container;
    this.diffText = diffText;
    this.filePath = filePath;
    this.lang = detectLanguage(filePath);
    this.viewMode = 'split';
    this.currentHunkIndex = -1;
    this.hunkElements = [];

    const parsed = parseDiff(diffText);
    this.headerLines = parsed.headerLines;
    this.hunks = parsed.hunks;
    this.rows = buildSideBySideRows(this.hunks);

    const stats = countDiffStats(this.hunks);
    this._additions = stats.additions;
    this._deletions = stats.deletions;

    this.render();
  }

  render() {
    this.container.replaceChildren();
    this.container.className = 'diff-viewer';

    this.container.appendChild(this._buildToolbar());

    this.content = _el('div', 'diff-viewer-content');
    this.container.appendChild(this.content);

    this.viewMode === 'split' ? this._renderSplit() : this._renderUnified();
  }

  _buildToolbar() {
    const toolbar = _el('div', 'diff-toolbar');
    toolbar.append(this._buildStats(), this._buildViewToggle(), this._buildNavigation());
    return toolbar;
  }

  _buildStats() {
    const stats = _el('span', 'diff-stats');
    stats.append(
      _el('span', 'diff-stat-add', `+${this._additions}`),
      document.createTextNode(' '),
      _el('span', 'diff-stat-del', `-${this._deletions}`),
    );
    return stats;
  }

  _buildViewToggle() {
    const toggleGroup = _el('div', 'diff-toggle-group');
    for (const mode of VIEW_MODES) {
      toggleGroup.appendChild(_el('button', {
        className: `diff-toggle-btn${this.viewMode === mode ? ' active' : ''}`,
        textContent: capitalize(mode),
        onClick: () => { this.viewMode = mode; this.render(); },
      }));
    }
    return toggleGroup;
  }

  _buildNavigation() {
    const nav = _el('div', 'diff-nav');

    const [btnPrev, btnNext] = NAV_BUTTONS.map(({ text, title, direction }) =>
      _el('button', { className: 'diff-nav-btn', textContent: text, title, onClick: () => this._navigateHunk(direction) }),
    );

    nav.append(
      btnPrev,
      _el('span', 'diff-nav-label', `${this.hunks.length} chunk${this.hunks.length !== 1 ? 's' : ''}`),
      btnNext,
    );
    return nav;
  }

  _navigateHunk(direction) {
    if (this.hunkElements.length === 0) return;
    this.currentHunkIndex += direction;
    if (this.currentHunkIndex < 0) this.currentHunkIndex = this.hunkElements.length - 1;
    if (this.currentHunkIndex >= this.hunkElements.length) this.currentHunkIndex = 0;

    const el = this.hunkElements[this.currentHunkIndex];
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('diff-hunk-flash');
    setTimeout(() => el.classList.remove('diff-hunk-flash'), HUNK_FLASH_DURATION_MS);
  }

  _appendSplitCells(rowEl, leftCell, rightCell) {
    rowEl.append(leftCell, _el('div', 'diff-separator'), rightCell);
  }

  _buildSplitHunkRow(row) {
    const rowEl = _el('div', 'diff-row diff-row-hunk');
    this.hunkElements.push(rowEl);
    this._appendSplitCells(rowEl,
      this._createCell('', row.left.content, 'hunk'),
      this._createCell('', row.right.content, 'hunk'));
    return rowEl;
  }

  _buildSplitChangeRow(row) {
    const { type: lt } = row.left;
    const { type: rt } = row.right;
    const rowEl = _el('div', 'diff-row');

    let leftSegments = null, rightSegments = null;
    if (lt === 'remove' && rt === 'add') {
      const wd = wordDiff(row.left.content, row.right.content);
      if (wd.oldSegments) leftSegments = wd.oldSegments;
      if (wd.newSegments) rightSegments = wd.newSegments;
    }

    this._appendSplitCells(rowEl,
      this._createCell(lt !== 'empty' ? row.left.lineNo : '', row.left.content, lt, leftSegments),
      this._createCell(rt !== 'empty' ? row.right.lineNo : '', row.right.content, rt, rightSegments));
    return rowEl;
  }

  _renderSplit() {
    this.hunkElements = [];
    const table = _el('div', 'diff-table diff-split');

    for (const row of this.rows) {
      table.appendChild(row.type === 'hunk'
        ? this._buildSplitHunkRow(row)
        : this._buildSplitChangeRow(row));
    }

    this.content.appendChild(table);
  }

  _renderUnified() {
    this.hunkElements = [];
    const table = _el('div', 'diff-table diff-unified');

    for (const hunk of this.hunks) {
      const hunkRow = _el('div', 'diff-row diff-row-hunk');
      this.hunkElements.push(hunkRow);
      hunkRow.appendChild(_el('div', 'diff-cell diff-cell-hunk diff-cell-full',
        `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context}`));
      table.appendChild(hunkRow);

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const change of hunk.changes) {
        const config = UNIFIED_CHANGE_CONFIG[change.type];
        if (!config) continue;

        const row = _el('div', `diff-row ${config.cssClass}`);
        row.append(
          _el('div', 'diff-line-no', config.showOld ? oldLine++ : ''),
          _el('div', 'diff-line-no', config.showNew ? newLine++ : ''),
          _el('div', 'diff-prefix', config.prefix),
          _el('div', 'diff-code', change.content),
        );
        table.appendChild(row);
      }
    }

    this.content.appendChild(table);
  }

  _createCell(lineNo, content, type, wordSegments) {
    const cell = _el('div', `diff-cell diff-cell-${type}`);
    cell.appendChild(_el('span', 'diff-line-no', lineNo));

    const codeEl = _el('span', 'diff-code');

    if (wordSegments) {
      this._renderWordSegments(codeEl, wordSegments, type);
    } else if (type !== 'empty') {
      this._highlightInto(codeEl, content);
    }

    cell.appendChild(codeEl);
    return cell;
  }

  _renderWordSegments(codeEl, segments, type) {
    const hlClass = WORD_DIFF_CLASS[type];
    for (const seg of segments) {
      codeEl.appendChild(_el('span', seg.highlighted ? hlClass : null, seg.text));
    }
  }

  _highlightInto(codeEl, text) {
    if (!window.hljs || !text || this.lang === 'plaintext') {
      codeEl.textContent = text;
      return;
    }
    try {
      const code = _el('code', `language-${this.lang}`, { textContent: text });
      window.hljs.highlightElement(code);
      codeEl.appendChild(code);
    } catch {
      codeEl.textContent = text;
    }
  }
}

registerComponent('DiffViewer', DiffViewer);
