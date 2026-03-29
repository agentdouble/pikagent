import { describe, it, expect } from 'vitest';
const { parseNameStatus, parseUntracked, DIFF_MAX_BUFFER } = require('../../main/git-helpers');

describe('git-helpers', () => {
  describe('parseNameStatus', () => {
    it('parses staged entries', () => {
      const raw = 'M\tsrc/app.js\nA\tsrc/new.js';
      const result = parseNameStatus(raw, true);
      expect(result).toEqual([
        { status: 'M', path: 'src/app.js', staged: true },
        { status: 'A', path: 'src/new.js', staged: true },
      ]);
    });

    it('parses unstaged entries', () => {
      const raw = 'D\told.js';
      const result = parseNameStatus(raw, false);
      expect(result).toEqual([{ status: 'D', path: 'old.js', staged: false }]);
    });

    it('returns empty array for null/empty input', () => {
      expect(parseNameStatus(null, true)).toEqual([]);
      expect(parseNameStatus('', true)).toEqual([]);
    });

    it('handles paths with tabs (renames)', () => {
      const raw = 'R100\told-name.js\tnew-name.js';
      const result = parseNameStatus(raw, true);
      expect(result[0].path).toBe('old-name.js\tnew-name.js');
    });
  });

  describe('parseUntracked', () => {
    it('parses untracked file list', () => {
      const raw = 'file1.js\nfile2.js';
      const result = parseUntracked(raw);
      expect(result).toEqual([
        { status: '?', path: 'file1.js', staged: false },
        { status: '?', path: 'file2.js', staged: false },
      ]);
    });

    it('returns empty array for null/empty input', () => {
      expect(parseUntracked(null)).toEqual([]);
      expect(parseUntracked('')).toEqual([]);
    });
  });

  describe('DIFF_MAX_BUFFER', () => {
    it('is 5MB', () => {
      expect(DIFF_MAX_BUFFER).toBe(5 * 1024 * 1024);
    });
  });
});
