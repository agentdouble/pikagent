import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('agents-editor-settings', () => {
  let storage;

  beforeEach(() => {
    vi.resetModules();
    storage = new Map();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key) => storage.get(key) ?? null),
      setItem: vi.fn((key, value) => storage.set(key, value)),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('identifies AGENTS.md by name or path', async () => {
    const { isAgentsMarkdownFile } = await import('../../src/utils/agents-editor-settings.js');

    expect(isAgentsMarkdownFile({ name: 'AGENTS.md', path: '/repo/AGENTS.md' })).toBe(true);
    expect(isAgentsMarkdownFile({ path: '/repo/nested/AGENTS.md' })).toBe(true);
    expect(isAgentsMarkdownFile('/repo/AGENTS.md')).toBe(true);
    expect(isAgentsMarkdownFile('/repo/README.md')).toBe(false);
  });

  it('enables double-click editing by default and persists disabled state', async () => {
    const {
      AGENTS_DOUBLE_CLICK_EDIT_KEY,
      setEditAgentsOnDoubleClick,
      shouldEditAgentsOnDoubleClick,
    } = await import('../../src/utils/agents-editor-settings.js');

    expect(shouldEditAgentsOnDoubleClick()).toBe(true);

    setEditAgentsOnDoubleClick(false);

    expect(storage.get(AGENTS_DOUBLE_CLICK_EDIT_KEY)).toBe('disabled');
    expect(shouldEditAgentsOnDoubleClick()).toBe(false);
  });
});
