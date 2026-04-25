/**
 * Tests for the dependency injection (DI) pattern — workspace / tab-lifecycle.
 * Split from di-injection.test.js (issue #83) to keep test files under 300 lines.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

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
    vi.doMock('../../src/utils/tab-constants.js', () => ({
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

// ── 6. workspace-layout: renderWorkspace uses explicit deps (no ctx) ──

describe('DI: workspace-layout renderWorkspace signature', () => {
  it('renderWorkspace uses destructured deps instead of ctx', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/utils/workspace-layout.js'),
      'utf-8',
    );

    // Should destructure deps and gitBranch from parameters (no raw ctx)
    expect(src).toMatch(/renderWorkspace\(\{\s*workspaceContainer/);
    expect(src).toMatch(/\{\s*gitBranch\s*\}/);

    // Should NOT contain ctx._api or ctx.workspaceContainer (fully decoupled)
    expect(src).not.toContain('ctx._api');
    expect(src).not.toContain('ctx.workspaceContainer');
    expect(src).not.toContain('ctx.activeTabId');
    expect(src).not.toContain('ctx.configManager');
  });
});

// ── 7. tab-manager passes explicit deps to renderWorkspace ──

describe('DI: tab-manager caller passes explicit deps to renderWorkspace', () => {
  it('renderWorkspace call in tab-manager passes explicit deps object and this._api', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/components/tab-manager.js'),
      'utf-8',
    );

    // Verify the caller passes an explicit deps object (not `this`)
    expect(src).toContain('doRenderWorkspace({');
    expect(src).toContain('this._api');
    // Should NOT pass `this` as first argument
    expect(src).not.toMatch(/doRenderWorkspace\(this,/);
  });
});
