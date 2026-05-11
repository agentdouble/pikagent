import { describe, it, expect } from 'vitest';
const { sanitizeName, sanitizeSegment } = require('../../shared/string-utils');

describe('string-utils', () => {
  describe('sanitizeName', () => {
    it('keeps alphanumeric, dash, underscore and space', () => {
      expect(sanitizeName('my-config_1 test')).toBe('my-config_1 test');
    });

    it('replaces special characters with underscore', () => {
      expect(sanitizeName('foo/bar:baz!')).toBe('foo_bar_baz_');
    });

    it('truncates to 64 characters', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeName(long)).toHaveLength(64);
    });
  });

  describe('sanitizeSegment', () => {
    it('replaces non-alphanum/dot/dash/underscore with hyphens', () => {
      expect(sanitizeSegment('feat/my branch')).toBe('feat-my-branch');
    });

    it('trims leading and trailing hyphens', () => {
      expect(sanitizeSegment('--hello--')).toBe('hello');
    });

    it('preserves dots, underscores and dashes', () => {
      expect(sanitizeSegment('v1.0_rc-1')).toBe('v1.0_rc-1');
    });
  });
});
