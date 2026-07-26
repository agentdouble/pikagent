import { describe, it, expect } from 'vitest';
const {
  matchAgent,
  parseChildPids,
  parseCwdFromLsof,
  getShellArgs,
  consumeCwdOsc,
} = require('../../main/pty-helpers');

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

  describe('Windows cwd shell integration', () => {
    it('installs the cwd prompt hook only for PowerShell on Windows', () => {
      const args = getShellArgs('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', 'win32');

      expect(args).toEqual(['-NoExit', '-Command', expect.stringContaining('CurrentDir=')]);
      expect(args[2]).toContain('[char]27');
      expect(args[2]).not.toContain('`e');
      expect(getShellArgs('cmd.exe', 'win32')).toEqual([]);
      expect(getShellArgs('powershell.exe', 'darwin')).toEqual([]);
    });

    it('extracts a cwd sequence split across PTY chunks', () => {
      const first = consumeCwdOsc('', '\x1b]1337;CurrentDir=C:\\Users\\rekta\\pro');
      const second = consumeCwdOsc(first.buffer, 'jet\\pikagent\x07PS> ');

      expect(first.cwd).toBe(null);
      expect(second.cwd).toBe('C:\\Users\\rekta\\projet\\pikagent');
      expect(second.buffer).toBe('PS> ');
    });

    it('accepts the ST terminator and keeps the latest cwd', () => {
      const result = consumeCwdOsc('', [
        '\x1b]1337;CurrentDir=C:\\one\x07',
        '\x1b]1337;CurrentDir=C:\\two\x1b\\',
      ].join(''));

      expect(result.cwd).toBe('C:\\two');
    });
  });
});
