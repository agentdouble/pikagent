import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('tab-renderer inlineRenameTab', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('keeps auto-rename enabled when rename commits the same value', async () => {
    vi.doMock('../../src/utils/form-helpers.js', () => ({
      startInlineRename: (_nameEl, opts) => opts.onCommit(opts.value),
    }));
    vi.doMock('../../src/utils/context-menu.js', () => ({ attachContextMenu: vi.fn() }));

    const { inlineRenameTab } = await import('../../src/utils/tab-renderer.js');
    const onCommit = vi.fn();
    const tab = { name: 'pickagent', userNamed: false };

    inlineRenameTab(tab, {}, onCommit, vi.fn());

    expect(tab.name).toBe('pickagent');
    expect(tab.userNamed).toBe(false);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('marks tab as user-named only when the value actually changes', async () => {
    vi.doMock('../../src/utils/form-helpers.js', () => ({
      startInlineRename: (_nameEl, opts) => opts.onCommit('renamed-workspace'),
    }));
    vi.doMock('../../src/utils/context-menu.js', () => ({ attachContextMenu: vi.fn() }));

    const { inlineRenameTab } = await import('../../src/utils/tab-renderer.js');
    const tab = { name: 'pickagent', userNamed: false };

    inlineRenameTab(tab, {}, vi.fn(), vi.fn());

    expect(tab.name).toBe('renamed-workspace');
    expect(tab.userNamed).toBe(true);
  });
});
