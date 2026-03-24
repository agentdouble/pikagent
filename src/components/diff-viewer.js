import { detectLanguage } from '../utils/file-icons.js';

const LCS_MAX_PRODUCT = 50_000;
const HUNK_FLASH_DURATION_MS = 600;
const VIEW_MODES = ['split', 'unified'];

const UNIFIED_CHANGE_CONFIG = {
  context: { prefix: ' ', cssClass: 'diff-row-context', showOld: true, showNew: true },
  add:     { prefix: '+', cssClass: 'diff-row-add',     showOld: false, showNew: true },
  remove:  { prefix: '-', cssClass: 'diff-row-remove',  showOld: true, showNew: false },
};

/**
 * Parse a unified diff string into structured hunks.
 */
function parseDiff(diffText) {
  const lines = diffText.split('\n');
  const hunks = [];
  let currentHunk = null;
  const headerLines = [];

  for (const line of lines) {
    if (line.startsWith('diff --git') || line.startsWith('---') || line.startsWith('+++') || line.startsWith('index ')) {
      headerLines.push(line);
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
    if (hunkMatch) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] || '1', 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] || '1', 10),
        context: hunkMatch[5] || '',
        changes: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith('+')) {
      currentHunk.changes.push({ type: 'add', content: line.slice(1) });
    } else if (line.startsWith('-')) {
      currentHunk.changes.push({ type: 'remove', content: line.slice(1) });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.changes.push({ type: 'context', content: line.slice(1) });
    }
  }

  return { headerLines, hunks };
}

/**
 * Build side-by-side rows from parsed hunks.
 * Each row: { left: { lineNo, content, type }, right: { lineNo, content, type } }
 */
function buildSideBySideRows(hunks) {
  const rows = [];

  for (const hunk of hunks) {
    rows.push({
      type: 'hunk',
      left: { content: `@@ -${hunk.oldStart},${hunk.oldCount}${hunk.context}`, type: 'hunk' },
      right: { content: `+${hunk.newStart},${hunk.newCount} @@${hunk.context}`, type: 'hunk' },
    });

    let oldLine = hunk.oldStart;
    let newLine = hunk.newStart;
    const changes = hunk.changes;
    let i = 0;

    while (i < changes.length) {
      const change = changes[i];

      if (change.type === 'context') {
        rows.push({
          type: 'context',
          left: { lineNo: oldLine++, content: change.content, type: 'context' },
          right: { lineNo: newLine++, content: change.content, type: 'context' },
        });
        i++;
      } else if (change.type === 'remove') {
        const removes = [];
        while (i < changes.length && changes[i].type === 'remove') {
          removes.push(changes[i]);
          i++;
        }
        const adds = [];
        while (i < changes.length && changes[i].type === 'add') {
          adds.push(changes[i]);
          i++;
        }

        const maxLen = Math.max(removes.length, adds.length);
        for (let j = 0; j < maxLen; j++) {
          const rem = removes[j];
          const add = adds[j];
          rows.push({
            type: 'change',
            left: rem
              ? { lineNo: oldLine++, content: rem.content, type: 'remove' }
              : { content: '', type: 'empty' },
            right: add
              ? { lineNo: newLine++, content: add.content, type: 'add' }
              : { content: '', type: 'empty' },
          });
        }
      } else if (change.type === 'add') {
        rows.push({
          type: 'change',
          left: { content: '', type: 'empty' },
          right: { lineNo: newLine++, content: change.content, type: 'add' },
        });
        i++;
      }
    }
  }

  return rows;
}

/**
 * Compute word-level diff between two strings.
 * Returns arrays of { text, highlighted } segments for each side.
 */
function wordDiff(oldStr, newStr) {
  const oldWords = tokenize(oldStr);
  const newWords = tokenize(newStr);
  const lcs = lcsMatrix(oldWords, newWords);

  // Fall back gracefully for very long lines where LCS is skipped
  if (!lcs) return { oldSegments: null, newSegments: null };

  let oi = oldWords.length, ni = newWords.length;
  const oldResult = [];
  const newResult = [];

  while (oi > 0 || ni > 0) {
    if (oi > 0 && ni > 0 && oldWords[oi - 1] === newWords[ni - 1]) {
      oldResult.unshift({ text: oldWords[oi - 1], highlighted: false });
      newResult.unshift({ text: newWords[ni - 1], highlighted: false });
      oi--; ni--;
    } else if (ni > 0 && (oi === 0 || lcs[oi][ni - 1] >= lcs[oi - 1][ni])) {
      newResult.unshift({ text: newWords[ni - 1], highlighted: true });
      ni--;
    } else {
      oldResult.unshift({ text: oldWords[oi - 1], highlighted: true });
      oi--;
    }
  }

  return { oldSegments: oldResult, newSegments: newResult };
}

function tokenize(str) {
  return str.match(/\S+|\s+/g) || [];
}

function lcsMatrix(a, b) {
  const m = a.length, n = b.length;
  if (m * n > LCS_MAX_PRODUCT) return null;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp;
}

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

    let additions = 0, deletions = 0;
    for (const hunk of this.hunks) {
      for (const c of hunk.changes) {
        if (c.type === 'add') additions++;
        if (c.type === 'remove') deletions++;
      }
    }
    this._additions = additions;
    this._deletions = deletions;

    this.render();
  }

  _el(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  render() {
    this.container.replaceChildren();
    this.container.className = 'diff-viewer';

    this.container.appendChild(this._buildToolbar());

    this.content = this._el('div', 'diff-viewer-content');
    this.container.appendChild(this.content);

    this.viewMode === 'split' ? this._renderSplit() : this._renderUnified();
  }

  _buildToolbar() {
    const toolbar = this._el('div', 'diff-toolbar');
    toolbar.append(this._buildStats(), this._buildViewToggle(), this._buildNavigation());
    return toolbar;
  }

  _buildStats() {
    const stats = this._el('span', 'diff-stats');
    stats.append(
      this._el('span', 'diff-stat-add', `+${this._additions}`),
      document.createTextNode(' '),
      this._el('span', 'diff-stat-del', `-${this._deletions}`),
    );
    return stats;
  }

  _buildViewToggle() {
    const toggleGroup = this._el('div', 'diff-toggle-group');
    for (const mode of VIEW_MODES) {
      const btn = this._el('button',
        `diff-toggle-btn${this.viewMode === mode ? ' active' : ''}`,
        mode[0].toUpperCase() + mode.slice(1));
      btn.addEventListener('click', () => { this.viewMode = mode; this.render(); });
      toggleGroup.appendChild(btn);
    }
    return toggleGroup;
  }

  _buildNavigation() {
    const nav = this._el('div', 'diff-nav');

    const btnPrev = this._el('button', 'diff-nav-btn', '\u25B2');
    btnPrev.title = 'Previous change';
    btnPrev.addEventListener('click', () => this._navigateHunk(-1));

    const btnNext = this._el('button', 'diff-nav-btn', '\u25BC');
    btnNext.title = 'Next change';
    btnNext.addEventListener('click', () => this._navigateHunk(1));

    nav.append(
      btnPrev,
      this._el('span', 'diff-nav-label', `${this.hunks.length} chunk${this.hunks.length !== 1 ? 's' : ''}`),
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
    rowEl.append(leftCell, this._el('div', 'diff-separator'), rightCell);
  }

  _renderSplit() {
    this.hunkElements = [];
    const table = this._el('div', 'diff-table diff-split');

    for (const row of this.rows) {
      const rowEl = this._el('div', 'diff-row');

      if (row.type === 'hunk') {
        rowEl.classList.add('diff-row-hunk');
        this.hunkElements.push(rowEl);
        this._appendSplitCells(rowEl,
          this._createCell('', row.left.content, 'hunk'),
          this._createCell('', row.right.content, 'hunk'));
      } else {
        const { type: lt } = row.left;
        const { type: rt } = row.right;

        let leftSegments = null, rightSegments = null;
        if (lt === 'remove' && rt === 'add') {
          const wd = wordDiff(row.left.content, row.right.content);
          if (wd.oldSegments) leftSegments = wd.oldSegments;
          if (wd.newSegments) rightSegments = wd.newSegments;
        }

        this._appendSplitCells(rowEl,
          this._createCell(lt !== 'empty' ? row.left.lineNo : '', row.left.content, lt, leftSegments),
          this._createCell(rt !== 'empty' ? row.right.lineNo : '', row.right.content, rt, rightSegments));
      }

      table.appendChild(rowEl);
    }

    this.content.appendChild(table);
  }

  _renderUnified() {
    this.hunkElements = [];
    const table = this._el('div', 'diff-table diff-unified');

    for (const hunk of this.hunks) {
      const hunkRow = this._el('div', 'diff-row diff-row-hunk');
      this.hunkElements.push(hunkRow);
      hunkRow.appendChild(this._el('div', 'diff-cell diff-cell-hunk diff-cell-full',
        `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context}`));
      table.appendChild(hunkRow);

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const change of hunk.changes) {
        const config = UNIFIED_CHANGE_CONFIG[change.type];
        if (!config) continue;

        const row = this._el('div', `diff-row ${config.cssClass}`);
        row.append(
          this._el('div', 'diff-line-no', config.showOld ? oldLine++ : ''),
          this._el('div', 'diff-line-no', config.showNew ? newLine++ : ''),
          this._el('div', 'diff-prefix', config.prefix),
          this._el('div', 'diff-code', change.content),
        );
        table.appendChild(row);
      }
    }

    this.content.appendChild(table);
  }

  _createCell(lineNo, content, type, wordSegments) {
    const cell = this._el('div', `diff-cell diff-cell-${type}`);
    cell.appendChild(this._el('span', 'diff-line-no', lineNo));

    const codeEl = this._el('span', 'diff-code');

    if (wordSegments) {
      this._renderWordSegments(codeEl, wordSegments, type);
    } else if (type !== 'empty') {
      this._highlightInto(codeEl, content);
    }

    cell.appendChild(codeEl);
    return cell;
  }

  _renderWordSegments(codeEl, segments, type) {
    const hlClass = type === 'remove' ? 'diff-word-del' : 'diff-word-add';
    for (const seg of segments) {
      codeEl.appendChild(this._el('span', seg.highlighted ? hlClass : null, seg.text));
    }
  }

  _highlightInto(codeEl, text) {
    if (!window.hljs || !text || this.lang === 'plaintext') {
      codeEl.textContent = text;
      return;
    }
    try {
      const code = document.createElement('code');
      code.className = `language-${this.lang}`;
      code.textContent = text;
      window.hljs.highlightElement(code);
      codeEl.appendChild(code);
    } catch {
      codeEl.textContent = text;
    }
  }
}
