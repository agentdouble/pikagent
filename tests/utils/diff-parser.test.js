import { describe, it, expect } from 'vitest';
import { parseDiff, buildSideBySideRows, countDiffStats, wordDiff } from '../../src/utils/diff-parser.js';

const SAMPLE_DIFF = `diff --git a/file.js b/file.js
index abc..def 100644
--- a/file.js
+++ b/file.js
@@ -1,4 +1,5 @@ function test()
 line1
-line2
+line2-modified
+line3-new
 line4`;

describe('diff-parser', () => {
  describe('parseDiff', () => {
    it('parses unified diff into hunks', () => {
      const { hunks, headerLines } = parseDiff(SAMPLE_DIFF);
      expect(headerLines).toHaveLength(4);
      expect(hunks).toHaveLength(1);
      expect(hunks[0].oldStart).toBe(1);
      expect(hunks[0].oldCount).toBe(4);
      expect(hunks[0].newStart).toBe(1);
      expect(hunks[0].newCount).toBe(5);
    });

    it('parses change types correctly', () => {
      const { hunks } = parseDiff(SAMPLE_DIFF);
      const types = hunks[0].changes.map((c) => c.type);
      expect(types).toEqual(['context', 'remove', 'add', 'add', 'context']);
    });

    it('handles empty diff', () => {
      const { hunks, headerLines } = parseDiff('');
      expect(hunks).toEqual([]);
      expect(headerLines).toEqual([]);
    });

    it('handles hunk without count (single line)', () => {
      const diff = '@@ -1 +1 @@\n-old\n+new';
      const { hunks } = parseDiff(diff);
      expect(hunks[0].oldCount).toBe(1);
      expect(hunks[0].newCount).toBe(1);
    });
  });

  describe('buildSideBySideRows', () => {
    it('builds paired rows from hunks', () => {
      const { hunks } = parseDiff(SAMPLE_DIFF);
      const rows = buildSideBySideRows(hunks);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].type).toBe('hunk');
    });

    it('pairs remove/add into change rows', () => {
      const { hunks } = parseDiff(SAMPLE_DIFF);
      const rows = buildSideBySideRows(hunks);
      const changeRows = rows.filter((r) => r.type === 'change');
      expect(changeRows.length).toBeGreaterThan(0);
      // First change should pair remove with add
      expect(changeRows[0].left.type).toBe('remove');
      expect(changeRows[0].right.type).toBe('add');
    });
  });

  describe('countDiffStats', () => {
    it('counts additions and deletions', () => {
      const { hunks } = parseDiff(SAMPLE_DIFF);
      const stats = countDiffStats(hunks);
      expect(stats.additions).toBe(2);
      expect(stats.deletions).toBe(1);
    });

    it('returns zeros for empty hunks', () => {
      expect(countDiffStats([])).toEqual({ additions: 0, deletions: 0 });
    });
  });

  describe('wordDiff', () => {
    it('highlights word-level changes', () => {
      const { oldSegments, newSegments } = wordDiff('hello world', 'hello universe');
      expect(oldSegments).toBeDefined();
      expect(newSegments).toBeDefined();
      // "hello" should not be highlighted, "world"/"universe" should be
      const oldHighlighted = oldSegments.filter((s) => s.highlighted);
      const newHighlighted = newSegments.filter((s) => s.highlighted);
      expect(oldHighlighted.length).toBeGreaterThan(0);
      expect(newHighlighted.length).toBeGreaterThan(0);
    });

    it('returns null segments for very large inputs', () => {
      const big = Array(300).fill('word').join(' ');
      const { oldSegments, newSegments } = wordDiff(big, big + ' extra');
      // 300 tokens * 301 tokens > LCS_MAX_PRODUCT (50000), so should return null
      expect(oldSegments).toBe(null);
      expect(newSegments).toBe(null);
    });

    it('handles identical strings', () => {
      const { oldSegments, newSegments } = wordDiff('same text', 'same text');
      expect(oldSegments.every((s) => !s.highlighted)).toBe(true);
      expect(newSegments.every((s) => !s.highlighted)).toBe(true);
    });
  });
});
