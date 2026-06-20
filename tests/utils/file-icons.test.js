import { describe, it, expect } from 'vitest';
import { detectLanguage, getFileIcon } from '../../src/utils/file-icons.js';

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
      expect(detectLanguage('/repo/Dockerfile')).toBe('dockerfile');
    });

    it('returns plaintext for unknown files', () => {
      expect(detectLanguage('file.xyz')).toBe('plaintext');
    });
  });

  describe('getFileIcon', () => {
    it('returns configured icons for known extensions and filenames', () => {
      expect(getFileIcon('README.md')).toBe('📝');
      expect(getFileIcon('package.json')).toBe('📋');
      expect(getFileIcon('Dockerfile')).toBe('📦');
      expect(getFileIcon('Makefile')).toBe('⚙️');
      expect(getFileIcon('/repo/Dockerfile')).toBe('📦');
    });

    it('returns a default document icon for unknown files', () => {
      expect(getFileIcon('file.xyz')).toBe('📄');
    });
  });
});
