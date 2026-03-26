/**
 * Pure diff parsing and computation utilities.
 * No DOM dependencies — can be tested in isolation.
 */

const LCS_MAX_PRODUCT = 50_000;

export const UNIFIED_CHANGE_CONFIG = {
  context: { prefix: ' ', cssClass: 'diff-row-context', showOld: true, showNew: true },
  add:     { prefix: '+', cssClass: 'diff-row-add',     showOld: false, showNew: true },
  remove:  { prefix: '-', cssClass: 'diff-row-remove',  showOld: true, showNew: false },
};

/**
 * Parse a unified diff string into structured hunks.
 */
export function parseDiff(diffText) {
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
export function buildSideBySideRows(hunks) {
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
 * Compute word-level diff between two strings.
 * Returns arrays of { text, highlighted } segments for each side.
 */
export function wordDiff(oldStr, newStr) {
  const oldWords = tokenize(oldStr);
  const newWords = tokenize(newStr);
  const lcs = lcsMatrix(oldWords, newWords);

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
