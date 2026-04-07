/**
 * Tests for the dependency injection (DI) pattern introduced in PR #71.
 * Verifies that util functions receive and use injected API methods
 * instead of accessing window.api directly.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ── 1. No remaining window.api references in util files ──

describe('DI: no direct window.api references in utils', () => {
  const utilsDir = path.resolve(__dirname, '../../src/utils');
  const utilFiles = fs.readdirSync(utilsDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => ({ name: f, content: fs.readFileSync(path.join(utilsDir, f), 'utf-8') }));

  it('should have util files to check', () => {
    expect(utilFiles.length).toBeGreaterThan(0);
  });

  for (const { name, content } of utilFiles) {
    it(`${name} has no window.api references`, () => {
      const matches = content.match(/window\.api\./g);
      expect(matches).toBeNull();
    });
  }
});

// ── 2. file-tree-context-menu: injected API methods are called ──

describe('DI: file-tree-context-menu', () => {
  let buildCommonContextItems, buildFileContextItems, buildDirContextItems;

  beforeAll(async () => {
    vi.doMock('../../src/utils/events.js', () => ({ bus: { emit: vi.fn(), on: vi.fn() } }));
    vi.doMock('../../src/utils/file-tree-helpers.js', () => ({
      getRelativePath: (p, root) => p.replace(root + '/', ''),
      INPUT_BLUR_DELAY: 100,
      computeIndent: () => 0,
    }));

    const mod = await import('../../src/utils/file-tree-context-menu.js');
    buildCommonContextItems = mod.buildCommonContextItems;
    buildFileContextItems = mod.buildFileContextItems;
    buildDirContextItems = mod.buildDirContextItems;
  });

  afterAll(() => { vi.restoreAllMocks(); });

  function makeApi() {
    return {
      clipboardWrite: vi.fn(),
      fsCopy: vi.fn(),
      showInFolder: vi.fn(),
      fsTrash: vi.fn(),
    };
  }

  // nameEl is only used as an opaque argument passed to promptRenameFn; a plain object suffices
  const stubEl = {};

  it('buildCommonContextItems passes clipboardWrite for Copy Path', () => {
    const api = makeApi();
    const items = buildCommonContextItems('/a/b.txt', stubEl, '/a', vi.fn(), undefined, api);
    const copyPath = items.find((i) => i.label === 'Copy Path');
    copyPath.action();
    expect(api.clipboardWrite).toHaveBeenCalledWith('/a/b.txt');
  });

  it('buildCommonContextItems passes clipboardWrite for Copy Relative Path', () => {
    const api = makeApi();
    const items = buildCommonContextItems('/a/b.txt', stubEl, '/a', vi.fn(), undefined, api);
    const copyRel = items.find((i) => i.label === 'Copy Relative Path');
    copyRel.action();
    expect(api.clipboardWrite).toHaveBeenCalledWith('b.txt');
  });

  it('buildCommonContextItems passes fsCopy for Duplicate', () => {
    const api = makeApi();
    const items = buildCommonContextItems('/a/b.txt', stubEl, '/a', vi.fn(), undefined, api);
    const dup = items.find((i) => i.label === 'Duplicate');
    dup.action();
    expect(api.fsCopy).toHaveBeenCalledWith('/a/b.txt');
  });

  it('buildCommonContextItems passes showInFolder for Reveal in Finder', () => {
    const api = makeApi();
    const items = buildCommonContextItems('/a/b.txt', stubEl, '/a', vi.fn(), undefined, api);
    const reveal = items.find((i) => i.label === 'Reveal in Finder');
    reveal.action();
    expect(api.showInFolder).toHaveBeenCalledWith('/a/b.txt');
  });

  it('buildFileContextItems forwards api to buildCommonContextItems', () => {
    const api = makeApi();
    const items = buildFileContextItems('/x/y.js', stubEl, '/x', vi.fn(), api);
    const dup = items.find((i) => i.label === 'Duplicate');
    dup.action();
    expect(api.fsCopy).toHaveBeenCalledWith('/x/y.js');
  });

  it('buildDirContextItems forwards api to common items', () => {
    const api = makeApi();
    const items = buildDirContextItems('/d', '/root', {}, 0, new Set(), stubEl, vi.fn(), vi.fn(), api);
    const dup = items.find((i) => i.label === 'Duplicate');
    dup.action();
    expect(api.fsCopy).toHaveBeenCalledWith('/d');
  });
});

// ── 3. file-tree-drop: handleFileDrop uses injected copyTo ──

describe('DI: file-tree-drop handleFileDrop', () => {
  let handleFileDrop;

  beforeAll(async () => {
    vi.doMock('../../src/utils/dom.js', () => ({
      _el: () => ({}),
      setupInlineInput: vi.fn(),
    }));
    vi.doMock('../../src/utils/events.js', () => ({ bus: { emit: vi.fn(), on: vi.fn() } }));
    vi.doMock('../../src/utils/file-tree-helpers.js', () => ({
      INPUT_BLUR_DELAY: 100,
      computeIndent: () => 0,
    }));

    const mod = await import('../../src/utils/file-tree-drop.js');
    handleFileDrop = mod.handleFileDrop;
  });

  afterAll(() => { vi.restoreAllMocks(); });

  it('calls injected copyTo for each file with a path', async () => {
    const copyTo = vi.fn().mockResolvedValue(undefined);
    const files = [{ path: '/src/a.txt' }, { path: '/src/b.txt' }, { path: '' }];
    await handleFileDrop(files, '/dest', { copyTo });
    expect(copyTo).toHaveBeenCalledTimes(2);
    expect(copyTo).toHaveBeenCalledWith('/src/a.txt', '/dest');
    expect(copyTo).toHaveBeenCalledWith('/src/b.txt', '/dest');
  });

  it('does not call copyTo when files have no path', async () => {
    const copyTo = vi.fn().mockResolvedValue(undefined);
    await handleFileDrop([{ path: '' }, {}], '/dest', { copyTo });
    expect(copyTo).not.toHaveBeenCalled();
  });
});

// ── 4. file-editor-renderer: saveFile uses injected writefile ──

describe('DI: file-editor-renderer saveFile', () => {
  let saveFile;

  beforeAll(async () => {
    vi.doMock('../../src/utils/dom.js', () => ({
      _el: (tag, cls, text) => {
        return { tag, className: cls, textContent: text, replaceChildren: vi.fn(), classList: { add: vi.fn(), remove: vi.fn() } };
      },
    }));

    const mod = await import('../../src/utils/file-editor-renderer.js');
    saveFile = mod.saveFile;
  });

  afterAll(() => { vi.restoreAllMocks(); });

  it('calls injected writefile and triggers onSuccess on success', async () => {
    const writefile = vi.fn().mockResolvedValue({});
    const onSuccess = vi.fn();
    const file = { content: 'hello', savedContent: '', error: null };
    const statusBar = { replaceChildren: vi.fn(), classList: { add: vi.fn(), remove: vi.fn() } };

    await saveFile('/test.js', file, statusBar, { onSuccess }, { writefile });

    expect(writefile).toHaveBeenCalledWith('/test.js', 'hello');
    expect(onSuccess).toHaveBeenCalled();
    expect(file.savedContent).toBe('hello');
  });

  it('does not call onSuccess when writefile returns error', async () => {
    const writefile = vi.fn().mockResolvedValue({ error: 'disk full' });
    const onSuccess = vi.fn();
    const file = { content: 'hello', savedContent: '', error: null };
    const statusBar = { replaceChildren: vi.fn(), classList: { add: vi.fn(), remove: vi.fn() } };

    await saveFile('/test.js', file, statusBar, { onSuccess }, { writefile });

    expect(writefile).toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('does nothing if file has error', async () => {
    const writefile = vi.fn();
    const onSuccess = vi.fn();
    const file = { content: 'hello', savedContent: '', error: 'bad file' };
    const statusBar = { replaceChildren: vi.fn() };

    await saveFile('/test.js', file, statusBar, { onSuccess }, { writefile });

    expect(writefile).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

// ── 5. tab-lifecycle: onTerminalCwdChanged uses injected gitBranch ──

describe('DI: tab-lifecycle onTerminalCwdChanged', () => {
  let onTerminalCwdChanged;

  beforeAll(async () => {
    vi.doMock('../../src/utils/dom.js', () => ({
      _el: () => ({}),
      showConfirmDialog: vi.fn().mockResolvedValue(true),
    }));
    vi.doMock('../../src/utils/events.js', () => ({ bus: { emit: vi.fn(), on: vi.fn() } }));
    vi.doMock('../../src/utils/id.js', () => ({ generateId: (prefix) => prefix + '-1' }));
    vi.doMock('../../src/utils/tab-manager-helpers.js', () => ({
      WorkspaceTab: class { constructor(id, name, cwd) { this.id = id; this.name = name; this.cwd = cwd; } },
    }));
    vi.doMock('../../src/utils/workspace-layout.js', () => ({
      reattachLayout: vi.fn(),
      syncFileTree: vi.fn(),
      capturePanelWidths: vi.fn(),
      disposeTab: vi.fn(),
    }));

    const mod = await import('../../src/utils/tab-lifecycle.js');
    onTerminalCwdChanged = mod.onTerminalCwdChanged;
  });

  afterAll(() => { vi.restoreAllMocks(); });

  it('calls injected gitBranch when active terminal changes cwd', () => {
    const gitBranch = vi.fn().mockResolvedValue('main');

    const tabs = new Map();
    tabs.set('tab1', {
      id: 'tab1',
      cwd: '/old',
      pathTextEl: { textContent: '' },
      branchBadgeEl: { textContent: '' },
      fileTree: { setTerminalRoot: vi.fn() },
      terminalPanel: {
        activeTerminal: { terminal: { id: 'term1' } },
        terminals: new Map([['term1', { id: 'term1' }]]),
      },
    });

    onTerminalCwdChanged(tabs, 'tab1', 'term1', '/new', { gitBranch });

    expect(gitBranch).toHaveBeenCalledWith('/new');
  });

  it('does not call gitBranch for non-active terminal', () => {
    const gitBranch = vi.fn().mockResolvedValue('dev');

    const tabs = new Map();
    tabs.set('tab1', {
      id: 'tab1',
      cwd: '/old',
      fileTree: { setTerminalRoot: vi.fn() },
      terminalPanel: {
        activeTerminal: { terminal: { id: 'term2' } },
        terminals: new Map([['term1', { id: 'term1' }]]),
      },
    });

    onTerminalCwdChanged(tabs, 'tab1', 'term1', '/new', { gitBranch });

    // gitBranch should NOT be called because term1 is not the active terminal
    expect(gitBranch).not.toHaveBeenCalled();
  });

  it('returns early if terminal not found in any tab', () => {
    const gitBranch = vi.fn();
    const tabs = new Map();

    onTerminalCwdChanged(tabs, 'tab1', 'unknown-term', '/new', { gitBranch });

    expect(gitBranch).not.toHaveBeenCalled();
  });
});

// ── 6. workspace-layout: renderWorkspace uses explicit api param ──

describe('DI: workspace-layout renderWorkspace signature', () => {
  it('renderWorkspace requires api as third parameter (no ctx._api fallback)', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/utils/workspace-layout.js'),
      'utf-8',
    );

    // Should destructure gitBranch from the third parameter directly
    expect(src).toMatch(/renderWorkspace\(ctx,\s*tab,\s*\{\s*gitBranch\s*\}\)/);

    // Should NOT contain ctx._api (regression risk with PR #69)
    expect(src).not.toContain('ctx._api');
  });
});

// ── 7. tab-manager passes api explicitly to renderWorkspace ──

describe('DI: tab-manager caller passes api explicitly', () => {
  it('renderWorkspace call in tab-manager passes this._api as third argument', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/tab-manager.js'),
      'utf-8',
    );

    // Verify the caller passes this._api explicitly
    expect(src).toContain('doRenderWorkspace(this, tab, this._api)');
  });
});
