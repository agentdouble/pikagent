import { describe, it, expect } from 'vitest';
import {
  getCursorPosition, insertTab, parseWebviewUrl,
  SAVE_FLASH_MS, TAB_SPACES, EMPTY_MESSAGE, STATIC_MODES,
} from '../../src/utils/editor-helpers.js';

describe('editor-helpers', () => {
  describe('constants', () => {
    it('SAVE_FLASH_MS is a positive number', () => {
      expect(SAVE_FLASH_MS).toBeGreaterThan(0);
    });

    it('TAB_SPACES is a string of spaces', () => {
      expect(TAB_SPACES).toMatch(/^ +$/);
    });

    it('EMPTY_MESSAGE is a non-empty string', () => {
      expect(EMPTY_MESSAGE.length).toBeGreaterThan(0);
    });

    it('STATIC_MODES contains files and git entries with key and label', () => {
      expect(STATIC_MODES).toEqual([
        { key: 'files', label: 'Files' },
        { key: 'git', label: 'Git Changes' },
      ]);
    });
  });

  describe('getCursorPosition', () => {
    it('returns line 1 col 1 for empty text at offset 0', () => {
      expect(getCursorPosition('', 0)).toEqual({ line: 1, col: 1, totalLines: 1 });
    });

    it('computes correct line and column', () => {
      const text = 'hello\nworld\nfoo';
      // cursor at 'w' in 'world' → line 2, col 1
      expect(getCursorPosition(text, 6)).toEqual({ line: 2, col: 1, totalLines: 3 });
    });

    it('handles cursor at end of multiline text', () => {
      const text = 'ab\ncd';
      expect(getCursorPosition(text, 5)).toEqual({ line: 2, col: 3, totalLines: 2 });
    });
  });

  describe('insertTab', () => {
    it('inserts tab spaces at cursor position', () => {
      const result = insertTab('hello', 2, 2, '  ');
      expect(result.text).toBe('he  llo');
      expect(result.cursorPos).toBe(4);
    });

    it('replaces selected text with tab', () => {
      const result = insertTab('hello', 1, 4, '  ');
      expect(result.text).toBe('h  o');
      expect(result.cursorPos).toBe(3);
    });
  });

  describe('parseWebviewUrl', () => {
    it('treats bare port number as localhost', () => {
      expect(parseWebviewUrl('3000')).toEqual({ url: 'http://localhost:3000', label: 'Localhost:3000' });
    });

    it('handles localhost:port', () => {
      expect(parseWebviewUrl('localhost:8080')).toEqual({ url: 'http://localhost:8080', label: 'Localhost:8080' });
    });

    it('prefixes http for plain domain', () => {
      const result = parseWebviewUrl('example.com/foo');
      expect(result.url).toBe('http://example.com/foo');
      expect(result.label).toBe('example.com/foo');
    });

    it('keeps existing https scheme', () => {
      const result = parseWebviewUrl('https://x.io');
      expect(result.url).toBe('https://x.io');
      expect(result.label).toBe('x.io');
    });

    it('keeps existing http scheme', () => {
      const result = parseWebviewUrl('http://app.local');
      expect(result.url).toBe('http://app.local');
      expect(result.label).toBe('app.local');
    });
  });
});
