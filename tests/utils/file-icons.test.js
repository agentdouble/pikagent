import { describe, it, expect } from 'vitest';
import { getFileIcon, detectLanguage } from '../../src/utils/file-icons.js';

describe('file-icons', () => {
  describe('getFileIcon', () => {
    it('returns folder icon for directories', () => {
      expect(getFileIcon('src', true)).toBe('📁');
    });

    it('returns correct icon for known extensions', () => {
      expect(getFileIcon('app.py', false)).toBe('🐍');
      expect(getFileIcon('style.css', false)).toBe('🎨');
      expect(getFileIcon('data.json', false)).toBe('📋');
      expect(getFileIcon('readme.md', false)).toBe('📝');
      expect(getFileIcon('run.sh', false)).toBe('⚡');
      expect(getFileIcon('.env', false)).toBe('🔒');
      expect(getFileIcon('photo.png', false)).toBe('🖼️');
    });

    it('returns default icon for unknown extensions', () => {
      expect(getFileIcon('file.xyz', false)).toBe('📄');
    });
  });

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
