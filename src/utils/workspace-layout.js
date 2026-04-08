/**
 * Workspace Layout Manager — extracted from tab-manager.js.
 *
 * Handles workspace rendering, layout helpers, and tab disposal.
 * Resize logic lives in workspace-resize.js.
 * Serialization logic lives in workspace-serializer.js.
 *
 * @typedef {Object} RenderWorkspaceDeps
 * @property {HTMLElement} workspaceContainer
 * @property {Function} getActiveTabId    - () => string|null
 * @property {Function} getActiveTab      - () => WorkspaceTab|null
 * @property {Function} scheduleAutoSave  - () => void
 *
 * @typedef {Object} DisposeAllTabsDeps
 * @property {Map<string, WorkspaceTab>} tabs
 * @property {Function} setActiveTabId    - (id) => void
 */

import { getComponent } from './component-registry.js';
import { bus } from './events.js';
import { _el } from './dom.js';
import { WORKSPACE_PANELS, TAB_DISPOSABLES } from './tab-manager-helpers.js';
import {
  buildSidePanel, buildCenterPanel,
  capturePanelWidths, restorePanelSizes,
} from './workspace-resize.js';

// Re-export from workspace-resize.js for backward compatibility
export {
  buildSidePanel, buildCenterPanel,
  setupPanelResize, togglePanel,
  capturePanelWidths, restorePanelSizes,
} from './workspace-resize.js';

// Re-export from workspace-serializer.js for backward compatibility
export { serialize, restoreConfig } from './workspace-serializer.js';

// ── Workspace rendering ──

/**
 * Render the full workspace layout for a tab.
 * @param {RenderWorkspaceDeps} deps
 * @param {import('./tab-manager-helpers.js').WorkspaceTab} tab
 * @param {{ gitBranch: Function }} api - injected API methods
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

  const branch = await gitBranch(tab.cwd);
  if (branch) tab.branchBadgeEl.textContent = ` ${branch}`;

  /** @fires workspace:activated {undefined} — initial workspace render complete */
  bus.emit('workspace:activated');
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

// ── Tab disposal ──

export function disposeTab(tab) {
  for (const key of TAB_DISPOSABLES) if (tab[key]) tab[key].dispose();
  if (tab.layoutElement) tab.layoutElement.remove();
}

/**
 * Dispose all tabs and clear the tab map.
 * @param {DisposeAllTabsDeps} deps
 */
export function disposeAllTabs({ tabs, setActiveTabId }) {
  for (const [id, tab] of [...tabs]) {
    disposeTab(tab);
    tabs.delete(id);
  }
  setActiveTabId(null);
}
