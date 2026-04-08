import { describe, it, expect } from 'vitest';
import { detectLanguage } from '../../src/utils/file-icons.js';

describe('file-icons', () => {
  describe('detectLanguage', () => {
    it('detects common languages', () => {
      expect(detectLanguage('app.js')).toBe('javascript');
      expect(detectLanguage('app.ts')).toBe('typescript');
      expect(detectLanguage('app.py')).toBe('python');
      expect(detectLanguage('app.go')).toBe('go');
      expect(detectLanguage('app.rs')).toBe('rust');
    });

    it('detects filename-based languages', () => {
      expect(detectLanguage('Dockerfile')).toBe('dockerfile');
      expect(detectLanguage('Makefile')).toBe('makefile');
    });

    it('returns plaintext for unknown files', () => {
      expect(detectLanguage('file.xyz')).toBe('plaintext');
    });
  });
});
