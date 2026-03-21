import { detectLanguage } from '../utils/file-icons.js';

const LCS_MAX_PRODUCT = 50_000;
const HUNK_FLASH_DURATION_MS = 600;

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
  let headerLines = [];

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
    // Hunk separator row
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
        // Collect consecutive removes and adds to pair them
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

  // Simple LCS-based word diff
  const lcs = lcsMatrix(oldWords, newWords);

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
  // For very long lines, skip LCS to avoid perf issues
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
    this.viewMode = 'split'; // 'split' | 'unified'
    this.currentHunkIndex = -1;
    this.hunkElements = [];

    const parsed = parseDiff(diffText);
    this.headerLines = parsed.headerLines;
    this.hunks = parsed.hunks;
    this.rows = buildSideBySideRows(this.hunks);

    this.render();
  }

  render() {
    this.container.innerHTML = '';
    this.container.className = 'diff-viewer';

    // Toolbar
    this.toolbar = this._buildToolbar();
    this.container.appendChild(this.toolbar);

    // Content
    this.content = document.createElement('div');
    this.content.className = 'diff-viewer-content';
    this.container.appendChild(this.content);

    if (this.viewMode === 'split') {
      this._renderSplit();
    } else {
      this._renderUnified();
    }
  }

  _buildToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'diff-toolbar';
    toolbar.appendChild(this._buildStats());
    toolbar.appendChild(this._buildViewToggle());
    toolbar.appendChild(this._buildNavigation());
    return toolbar;
  }

  _buildStats() {
    const stats = document.createElement('span');
    stats.className = 'diff-stats';
    let additions = 0, deletions = 0;
    for (const hunk of this.hunks) {
      for (const c of hunk.changes) {
        if (c.type === 'add') additions++;
        if (c.type === 'remove') deletions++;
      }
    }
    stats.innerHTML = `<span class="diff-stat-add">+${additions}</span> <span class="diff-stat-del">-${deletions}</span>`;
    return stats;
  }

  _buildViewToggle() {
    const toggleGroup = document.createElement('div');
    toggleGroup.className = 'diff-toggle-group';

    for (const mode of ['split', 'unified']) {
      const btn = document.createElement('button');
      btn.className = `diff-toggle-btn ${this.viewMode === mode ? 'active' : ''}`;
      btn.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      btn.addEventListener('click', () => { this.viewMode = mode; this.render(); });
      toggleGroup.appendChild(btn);
    }

    return toggleGroup;
  }

  _buildNavigation() {
    const nav = document.createElement('div');
    nav.className = 'diff-nav';

    const btnPrev = document.createElement('button');
    btnPrev.className = 'diff-nav-btn';
    btnPrev.textContent = '▲';
    btnPrev.title = 'Previous change';
    btnPrev.addEventListener('click', () => this._navigateHunk(-1));

    const hunkLabel = document.createElement('span');
    hunkLabel.className = 'diff-nav-label';
    hunkLabel.textContent = `${this.hunks.length} chunk${this.hunks.length !== 1 ? 's' : ''}`;

    const btnNext = document.createElement('button');
    btnNext.className = 'diff-nav-btn';
    btnNext.textContent = '▼';
    btnNext.title = 'Next change';
    btnNext.addEventListener('click', () => this._navigateHunk(1));

    nav.appendChild(btnPrev);
    nav.appendChild(hunkLabel);
    nav.appendChild(btnNext);
    return nav;
  }

  _navigateHunk(direction) {
    if (this.hunkElements.length === 0) return;
    this.currentHunkIndex += direction;
    if (this.currentHunkIndex < 0) this.currentHunkIndex = this.hunkElements.length - 1;
    if (this.currentHunkIndex >= this.hunkElements.length) this.currentHunkIndex = 0;

    this.hunkElements[this.currentHunkIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Flash highlight
    const el = this.hunkElements[this.currentHunkIndex];
    el.classList.add('diff-hunk-flash');
    setTimeout(() => el.classList.remove('diff-hunk-flash'), HUNK_FLASH_DURATION_MS);
  }

  _appendSplitCells(rowEl, leftCell, rightCell) {
    const sep = document.createElement('div');
    sep.className = 'diff-separator';
    rowEl.appendChild(leftCell);
    rowEl.appendChild(sep);
    rowEl.appendChild(rightCell);
  }

  _renderSplit() {
    this.hunkElements = [];
    const table = document.createElement('div');
    table.className = 'diff-table diff-split';

    for (const row of this.rows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'diff-row';

      if (row.type === 'hunk') {
        rowEl.classList.add('diff-row-hunk');
        this.hunkElements.push(rowEl);
        this._appendSplitCells(
          rowEl,
          this._createCell('', row.left.content, 'hunk'),
          this._createCell('', row.right.content, 'hunk'),
        );
      } else {
        const leftType = row.left.type;
        const rightType = row.right.type;

        // Word diff for paired changes
        let leftSegments = null, rightSegments = null;
        if (leftType === 'remove' && rightType === 'add') {
          const wd = wordDiff(row.left.content, row.right.content);
          if (wd.oldSegments) leftSegments = wd.oldSegments;
          if (wd.newSegments) rightSegments = wd.newSegments;
        }

        this._appendSplitCells(
          rowEl,
          this._createCell(leftType !== 'empty' ? row.left.lineNo : '', row.left.content, leftType, leftSegments),
          this._createCell(rightType !== 'empty' ? row.right.lineNo : '', row.right.content, rightType, rightSegments),
        );
      }

      table.appendChild(rowEl);
    }

    this.content.appendChild(table);
  }

  _renderUnified() {
    this.hunkElements = [];
    const table = document.createElement('div');
    table.className = 'diff-table diff-unified';

    for (const hunk of this.hunks) {
      // Hunk header
      const hunkRow = document.createElement('div');
      hunkRow.className = 'diff-row diff-row-hunk';
      this.hunkElements.push(hunkRow);

      const hunkCell = document.createElement('div');
      hunkCell.className = 'diff-cell diff-cell-hunk diff-cell-full';
      hunkCell.textContent = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${hunk.context}`;
      hunkRow.appendChild(hunkCell);
      table.appendChild(hunkRow);

      let oldLine = hunk.oldStart;
      let newLine = hunk.newStart;

      for (const change of hunk.changes) {
        const config = UNIFIED_CHANGE_CONFIG[change.type];
        if (!config) continue;

        const row = document.createElement('div');
        row.className = `diff-row ${config.cssClass}`;

        const oldNum = document.createElement('div');
        oldNum.className = 'diff-line-no';
        oldNum.textContent = config.showOld ? oldLine++ : '';

        const newNum = document.createElement('div');
        newNum.className = 'diff-line-no';
        newNum.textContent = config.showNew ? newLine++ : '';

        const prefix = document.createElement('div');
        prefix.className = 'diff-prefix';
        prefix.textContent = config.prefix;

        const code = document.createElement('div');
        code.className = 'diff-code';
        code.textContent = change.content;

        row.appendChild(oldNum);
        row.appendChild(newNum);
        row.appendChild(prefix);
        row.appendChild(code);
        table.appendChild(row);
      }
    }

    this.content.appendChild(table);
  }

  _createCell(lineNo, content, type, wordSegments) {
    const cell = document.createElement('div');
    cell.className = `diff-cell diff-cell-${type}`;

    const lineNoEl = document.createElement('span');
    lineNoEl.className = 'diff-line-no';
    lineNoEl.textContent = lineNo;

    const codeEl = document.createElement('span');
    codeEl.className = 'diff-code';

    if (wordSegments) {
      for (const seg of wordSegments) {
        const span = document.createElement('span');
        span.textContent = seg.text;
        if (seg.highlighted) {
          span.className = type === 'remove' ? 'diff-word-del' : 'diff-word-add';
        }
        codeEl.appendChild(span);
      }
    } else if (type !== 'empty') {
      // Apply syntax highlighting
      const highlighted = this._highlight(content);
      if (highlighted) {
        codeEl.innerHTML = highlighted;
      } else {
        codeEl.textContent = content;
      }
    }

    cell.appendChild(lineNoEl);
    cell.appendChild(codeEl);
    return cell;
  }

  _highlight(text) {
    if (!window.hljs || !text || this.lang === 'plaintext') return null;
    try {
      const result = window.hljs.highlight(text, { language: this.lang, ignoreIllegals: true });
      return result.value;
    } catch {
      return null;
    }
  }
}
