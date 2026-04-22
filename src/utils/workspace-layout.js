/**
 * Workspace Layout Manager — extracted from tab-manager.js.
 *
 * Handles workspace rendering, layout helpers, and tab disposal.
 * Resize logic lives in workspace-resize.js.
 * Serialization logic lives in workspace-serializer.js.
 *
 * @typedef {{ workspaceContainer: HTMLElement, getActiveTabId: () => string|null, getActiveTab: () => import('./tab-manager-helpers.js').WorkspaceTab|null, scheduleAutoSave: () => void }} RenderWorkspaceDeps
 *
 * Tab disposal logic lives in workspace-cleanup.js.
 */

import { getComponent } from './component-registry.js';
import { emitWorkspaceActivated } from './workspace-events.js';
import { _el } from './dom.js';
import { WORKSPACE_PANELS } from './tab-manager-helpers.js';
import {
  buildSidePanel, buildCenterPanel,
  capturePanelWidths, restorePanelSizes,
} from './workspace-resize.js';

// NOTE: backward-compat re-exports removed (issue #94).
// Import directly from workspace-resize.js and workspace-cleanup.js.

// ── Workspace rendering ──

/**
 * Instantiate tab sub-components and restore saved state if present.
 *
 * @param {import('./tab-manager-helpers.js').WorkspaceTab} tab
 * @param {HTMLElement} layout
 * @param {{ left: { content: HTMLElement, panel: HTMLElement }, right: { content: HTMLElement, panel: HTMLElement } }} sides
 * @param {HTMLElement} termContainer
 * @param {() => string|null} getActiveTabId
 */
function _initTabComponents(tab, layout, sides, termContainer, getActiveTabId) {
  const FileTree = getComponent('FileTree');
  const FileViewer = getComponent('FileViewer');
  const TerminalPanel = getComponent('TerminalPanel');

  tab.layoutElement = layout;
  tab.fileTree = new FileTree(sides.left.content);
  tab.fileViewer = new FileViewer(sides.right.content, () => tab.id === getActiveTabId());

  if (tab._restoreData?.splitTree) {
    tab.terminalPanel = new TerminalPanel(termContainer, tab.cwd);
    tab.terminalPanel.restoreFromTree(tab._restoreData.splitTree);
    restorePanelSizes(tab._restoreData.panels, { left: sides.left.panel, right: sides.right.panel });
    syncFileTree(tab);
    if (tab._restoreData.webviewTabs && tab.fileViewer) {
      tab.fileViewer.setWebviewTabs(tab._restoreData.webviewTabs);
    }
    delete tab._restoreData;
  } else {
    tab.terminalPanel = new TerminalPanel(termContainer, tab.cwd);
    const firstTermId = tab.terminalPanel.activeTerminal?.terminal?.id;
    if (firstTermId) tab.fileTree.setTerminalRoot(firstTermId, tab.cwd);
  }
}

/**
 * Render the full workspace layout for a tab.
 * @param {RenderWorkspaceDeps} deps
 * @param {import('./tab-manager-helpers.js').WorkspaceTab} tab
 * @param {{ gitBranch: (cwd: string) => Promise<string> }} api - injected API methods
 */
export async function renderWorkspace({ workspaceContainer, getActiveTabId, getActiveTab, scheduleAutoSave }, tab, { gitBranch }) {
  workspaceContainer.replaceChildren();

  const panelDeps = { getActiveTab, scheduleAutoSave };
  const layout = _el('div', 'workspace-layout');

  // Build side panels from declarative config
  const sides = {};
  for (const def of WORKSPACE_PANELS) {
    sides[def.side] = buildSidePanel(panelDeps, def);
  }

  const { panel: centerPanel, termContainer } = buildCenterPanel(panelDeps, tab, sides.left.panel, sides.right.panel);

  layout.append(
    sides.left.panel, sides.left.handle,
    centerPanel,
    sides.right.handle, sides.right.panel,
  );
  workspaceContainer.appendChild(layout);

  _initTabComponents(tab, layout, sides, termContainer, getActiveTabId);

  const branch = await gitBranch(tab.cwd);
  if (branch) tab.branchBadgeEl.textContent = ` ${branch}`;

  /** @fires workspace:activated {undefined} — initial workspace render complete */
  emitWorkspaceActivated();
}

// ── Layout helpers ──

/**
 * Re-attach a tab's existing layout element to the workspace container.
 * @param {{ workspaceContainer: HTMLElement }} deps
 * @param {import('./tab-manager-helpers.js').WorkspaceTab} tab
 */
export function reattachLayout({ workspaceContainer }, tab) {
  workspaceContainer.replaceChildren();
  workspaceContainer.appendChild(tab.layoutElement);
  if (tab.terminalPanel) {
    tab.terminalPanel.fitAll();
    if (tab.terminalPanel.activeTerminal) {
      tab.terminalPanel.activeTerminal.terminal.focus();
    }
  }
}

/**
 * Synchronize a tab's file tree with its terminal panel, removing stale
 * entries and updating roots for all active terminals.
 * @param {import('./tab-manager-helpers.js').WorkspaceTab} tab
 */
export function syncFileTree(tab) {
  if (tab.fileTree && tab.terminalPanel) {
    // Remove stale entries (e.g. ghost terminal from TerminalPanel.init() before restoreFromTree)
    const activeTermIds = new Set(tab.terminalPanel.terminals.keys());
    for (const termId of [...tab.fileTree.termCwds.keys()]) {
      if (!activeTermIds.has(termId)) {
        tab.fileTree.removeTerminal(termId);
      }
    }
    for (const [termId, node] of tab.terminalPanel.terminals) {
      tab.fileTree.setTerminalRoot(termId, node.terminal.cwd);
    }
  }
}

