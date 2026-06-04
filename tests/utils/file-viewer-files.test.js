import { describe, expect, it, vi } from 'vitest';
import {
  applyRequestedViewMode,
  openFileEntry,
  resolveInitialViewMode,
} from '../../src/utils/file-viewer-files.js';

describe('file-viewer-files view modes', () => {
  it('uses preview for markdown by default and honors explicit edit mode', () => {
    expect(resolveInitialViewMode('markdown')).toBe('preview');
    expect(resolveInitialViewMode('markdown', 'edit')).toBe('edit');
    expect(resolveInitialViewMode('markdown', 'preview')).toBe('preview');
    expect(resolveInitialViewMode('javascript', 'preview')).toBe('edit');
  });

  it('applies requested view mode only to markdown files', () => {
    const markdownFile = { lang: 'markdown', viewMode: 'preview' };
    const jsFile = { lang: 'javascript', viewMode: 'edit' };

    expect(applyRequestedViewMode(markdownFile, 'edit')).toBe(true);
    expect(markdownFile.viewMode).toBe('edit');
    expect(applyRequestedViewMode(jsFile, 'preview')).toBe(false);
    expect(jsFile.viewMode).toBe('edit');
  });

  it('opens markdown files directly in edit mode when requested', async () => {
    const openFiles = new Map();
    const readfile = vi.fn().mockResolvedValue({ content: '# Agents' });

    await openFileEntry(openFiles, '/repo/AGENTS.md', 'AGENTS.md', { readfile }, { viewMode: 'edit' });

    expect(openFiles.get('/repo/AGENTS.md').viewMode).toBe('edit');
  });
});
