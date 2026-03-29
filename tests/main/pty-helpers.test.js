import { describe, it, expect } from 'vitest';
const { matchAgent, parseChildPids, parseCwdFromLsof } = require('../../main/pty-helpers');

describe('pty-helpers', () => {
  describe('matchAgent', () => {
    it('detects claude', () => {
      expect(matchAgent('node /usr/bin/claude --verbose')).toBe('Claude');
    });

    it('detects codex', () => {
      expect(matchAgent('/usr/local/bin/codex run')).toBe('Codex');
    });

    it('detects opencode', () => {
      expect(matchAgent('opencode -p "hello"')).toBe('OpenCode');
    });

    it('is case-insensitive', () => {
      expect(matchAgent('CLAUDE --help')).toBe('Claude');
    });

    it('returns null for unknown process', () => {
      expect(matchAgent('vim file.js')).toBe(null);
    });
  });

  describe('parseChildPids', () => {
    it('parses pgrep output into pid array', () => {
      expect(parseChildPids('1234\n5678\n')).toEqual(['1234', '5678']);
    });

    it('handles single pid', () => {
      expect(parseChildPids('42')).toEqual(['42']);
    });

    it('returns empty array for empty input', () => {
      expect(parseChildPids('')).toEqual([]);
    });
  });

  describe('parseCwdFromLsof', () => {
    it('extracts cwd path from lsof output', () => {
      const output = 'p1234\nfcwd\nn/Users/test/project';
      expect(parseCwdFromLsof(output)).toBe('/Users/test/project');
    });

    it('returns null when no path found', () => {
      expect(parseCwdFromLsof('')).toBe(null);
    });
  });
});
