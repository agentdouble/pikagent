import { describe, it, expect } from 'vitest';
const { sanitizeName, sanitizeSegment } = require('../../shared/string-utils');

describe('shared/string-utils', () => {
  describe('sanitizeName (default options)', () => {
    it('keeps alphanumeric, dash, underscore and space', () => {
      expect(sanitizeName('my-config_1 test')).toBe('my-config_1 test');
    });

    it('replaces special characters with underscore', () => {
      expect(sanitizeName('foo/bar:baz!')).toBe('foo_bar_baz_');
    });

    it('truncates to 64 characters by default', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeName(long)).toHaveLength(64);
    });

    it('does not trim separator by default', () => {
      expect(sanitizeName('!hello!')).toBe('_hello_');
    });
  });

  describe('sanitizeName (custom options)', () => {
    it('respects custom allowedChars', () => {
      expect(sanitizeName('hello world', { allowedChars: 'a-z', separator: '-' })).toBe('hello-world');
    });

    it('respects custom separator', () => {
      expect(sanitizeName('foo/bar', { separator: '-' })).toBe('foo-bar');
    });

    it('respects maxLength = 0 (no truncation)', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeName(long, { maxLength: 0 })).toHaveLength(100);
    });

    it('respects custom maxLength', () => {
      expect(sanitizeName('hello world', { maxLength: 5 })).toBe('hello');
    });

    it('trims separator when trimSeparator is true', () => {
      expect(sanitizeName('!hello!', { trimSeparator: true })).toBe('hello');
    });

    it('collapses consecutive disallowed chars into a single separator', () => {
      expect(sanitizeName('foo///bar', { allowedChars: 'a-z', separator: '-' })).toBe('foo-bar');
    });
  });

  describe('sanitizeSegment', () => {
    it('replaces slashes with hyphens', () => {
      expect(sanitizeSegment('feat/my-branch')).toBe('feat-my-branch');
    });

    it('preserves dots, underscores, dashes', () => {
      expect(sanitizeSegment('v1.2_rc-1')).toBe('v1.2_rc-1');
    });

    it('trims leading and trailing hyphens', () => {
      expect(sanitizeSegment('/hello/')).toBe('hello');
    });

    it('collapses consecutive non-alphanumeric chars into a single hyphen', () => {
      expect(sanitizeSegment('foo//bar')).toBe('foo-bar');
    });

    it('handles empty string', () => {
      expect(sanitizeSegment('')).toBe('');
    });

    it('does not truncate long strings', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeSegment(long)).toHaveLength(100);
    });
  });
});
