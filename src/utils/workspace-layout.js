/**
 * Workspace Layout Manager — extracted from tab-manager.js.
 *
 * Handles workspace panel building, resize, serialization, and restoration.
 * All functions receive a `ctx` (TabManager instance) as their first argument.
 */

import { getComponent } from './component-registry.js';
import { bus } from './events.js';
import { _el } from './dom.js';
import { trackMouse } from './drag-helpers.js';
import { generateId } from './id.js';
import {
  PANEL_MIN_WIDTH, FIT_DELAY_MS,
  WORKSPACE_PANELS, WorkspaceTab, TAB_DISPOSABLES,
  clampPanelWidth, panelArrowState,
} from './tab-manager-helpers.js';
import { disposeAllSideViews } from './sidebar-manager.js';

// ── Panel building ──

export function buildSidePanel(ctx, { side, contentCls, title }) {
  const panel = _el('div', `panel panel-${side}`);
  if (title) {
    const header = _el('div', 'panel-header');
    header.appendChild(_el('span', 'panel-title', title));
    panel.appendChild(header);
  }
  const content = _el('div', contentCls);
  panel.appendChild(content);
  const handle = _el('div', 'panel-resize-handle');
  setupPanelResize(ctx, handle, panel, side);
  return { panel, handle, content };
}

export function buildCenterPanel(ctx, tab, leftPanel, rightPanel) {
  const panel = _el('div', 'panel panel-center');
  const header = _el('div', 'panel-header');

  const pathInfo = _el('div', 'path-info');

  const pathArrowLeft = _el('span', 'path-arrow', '\u2190');
  pathArrowLeft.title = 'Collapse left panel';
  pathArrowLeft.addEventListener('click', () => togglePanel(ctx, leftPanel, 'left', pathArrowLeft));

  const pathText = _el('span', 'path-text', tab.cwd);
  const branchBadge = _el('span', 'branch-badge', '');

  const pathArrowRight = _el('span', 'path-arrow', '\u2192');
  pathArrowRight.title = 'Collapse right panel';
  pathArrowRight.addEventListener('click', () => togglePanel(ctx, rightPanel, 'right', pathArrowRight));

  pathInfo.append(pathArrowLeft, pathText, branchBadge, pathArrowRight);
  header.appendChild(pathInfo);
  header.appendChild(_el('div', 'term-label', 'Terminal'));
  panel.appendChild(header);

  const termContainer = _el('div', 'terminal-area');
  panel.appendChild(termContainer);

  tab.pathTextEl = pathText;
  tab.branchBadgeEl = branchBadge;

  return { panel, termContainer };
}

// ── Panel resize / toggle ──

export function setupPanelResize(ctx, handle, panel, side) {
  let startX = 0;
  let startWidth = 0;

  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startX = e.clientX;
    startWidth = panel.getBoundingClientRect().width;
    trackMouse('col-resize',
      (ev) => {
        const dx = ev.clientX - startX;
        const newWidth = side === 'left' ? startWidth + dx : startWidth - dx;
        panel.style.width = `${clampPanelWidth(newWidth, side)}px`;
        panel.style.flex = 'none';
        ctx._activeTab()?.terminalPanel?.fitAll();
      },
      () => ctx.configManager.scheduleAutoSave(),
    );
  });
}

export function togglePanel(ctx, panel, side, arrowEl) {
  panel.classList.add('animating');
  panel.classList.toggle('collapsed');
  const isCollapsed = panel.classList.contains('collapsed');

  if (arrowEl) {
    const arrow = panelArrowState(side, isCollapsed);
    arrowEl.textContent = arrow.text;
    arrowEl.title = arrow.title;
  }

  setTimeout(() => {
    panel.classList.remove('animating');
    ctx._activeTab()?.terminalPanel?.fitAll();
  }, FIT_DELAY_MS);
  ctx.configManager.scheduleAutoSave();
}

// ── Panel width capture / restore ──

export function capturePanelWidths(tab) {
  if (!tab.layoutElement) return;
  tab._panelWidths = {};
  for (const { side, widthKey, collapsedKey } of WORKSPACE_PANELS) {
    const el = tab.layoutElement.querySelector(`.panel-${side}`);
    if (!el) continue;
    tab._panelWidths[widthKey] = el.getBoundingClientRect().width;
    tab._panelWidths[collapsedKey] = el.classList.contains('collapsed');
  }
}

export function restorePanelSizes(panels, panelEls) {
  if (!panels) return;
  for (const { widthKey, collapsedKey, side } of WORKSPACE_PANELS) {
    const el = panelEls[side];
    if (!el) continue;
    if (panels[widthKey] && !panels[collapsedKey]) {
      el.style.width = `${panels[widthKey]}px`;
      el.style.flex = 'none';
    }
    if (panels[collapsedKey]) el.classList.add('collapsed');
  }
}

// ── Workspace rendering ──

/**
 * @param {Object} ctx
 * @param {WorkspaceTab} tab
 * @param {{ gitBranch: Function }} api - injected API methods
 */
export async function renderWorkspace(ctx, tab, { gitBranch }) {
  ctx.workspaceContainer.replaceChildren();

  const layout = _el('div', 'workspace-layout');

  // Build side panels from declarative config
  const sides = {};
  for (const def of WORKSPACE_PANELS) {
    sides[def.side] = buildSidePanel(ctx, def);
  }

  const { panel: centerPanel, termContainer } = buildCenterPanel(ctx, tab, sides.left.panel, sides.right.panel);

  layout.append(
    sides.left.panel, sides.left.handle,
    centerPanel,
    sides.right.handle, sides.right.panel,
  );
  ctx.workspaceContainer.appendChild(layout);

  const FileTree = getComponent('FileTree');
  const FileViewer = getComponent('FileViewer');
  const TerminalPanel = getComponent('TerminalPanel');

  tab.layoutElement = layout;
  tab.fileTree = new FileTree(sides.left.content);
  tab.fileViewer = new FileViewer(sides.right.content, () => tab.id === ctx.activeTabId);

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

  /** @emits workspace:activated {undefined} — initial workspace render complete */
  bus.emit('workspace:activated');
}

// ── Layout helpers ──

export function reattachLayout(ctx, tab) {
  ctx.workspaceContainer.replaceChildren();
  ctx.workspaceContainer.appendChild(tab.layoutElement);
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

// ── Serialization ──

export function serialize(ctx) {
  const tabs = [];
  let activeTabIndex = 0;
  let i = 0;

  for (const [id, tab] of ctx.tabs) {
    if (id === ctx.activeTabId) activeTabIndex = i;

    const tabData = {
      name: tab.name,
      cwd: tab.cwd,
      noShortcut: tab.noShortcut || false,
      colorGroup: tab.colorGroup || null,
      splitTree: null,
      panels: {},
    };

    // Serialize terminal tree (works for both active and detached layouts)
    if (tab.terminalPanel) {
      tabData.splitTree = tab.terminalPanel.serialize();
    }

    // Serialize webview tabs
    if (tab.fileViewer) {
      tabData.webviewTabs = tab.fileViewer.getWebviewTabs();
    }

    // Panel widths — active tab: snapshot from live DOM; inactive: use cached
    if (id === ctx.activeTabId) capturePanelWidths(tab);
    if (tab._panelWidths) tabData.panels = { ...tab._panelWidths };

    tabs.push(tabData);
    i++;
  }

  return { tabs, activeTabIndex };
}

// ── Restore ──

export async function restoreConfig(ctx, config) {
  if (!config || !config.tabs || config.tabs.length === 0) return;

  ctx.configManager.isRestoring = true;

  // Reset side views (old terminal IDs will be invalid)
  disposeAllSideViews(ctx);
  disposeAllTabs(ctx);

  // Create tabs from config
  for (const tabData of config.tabs) {
    const id = generateId('tab');
    const tab = new WorkspaceTab(id, tabData.name, tabData.cwd || ctx.defaultCwd || '/');
    tab.noShortcut = tabData.noShortcut || false;
    tab.colorGroup = tabData.colorGroup || null;
    tab._restoreData = tabData;
    ctx.tabs.set(id, tab);
  }

  ctx.renderTabBar();

  // Switch to the active tab
  const tabIds = Array.from(ctx.tabs.keys());
  const activeIdx = Math.min(config.activeTabIndex || 0, tabIds.length - 1);
  ctx.switchTo(tabIds[activeIdx]);

  ctx.configManager.isRestoring = false;
}

// ── Tab disposal ──

export function disposeTab(tab) {
  for (const key of TAB_DISPOSABLES) if (tab[key]) tab[key].dispose();
  if (tab.layoutElement) tab.layoutElement.remove();
}

export function disposeAllTabs(ctx) {
  for (const [id, tab] of [...ctx.tabs]) {
    disposeTab(tab);
    ctx.tabs.delete(id);
  }
  ctx.activeTabId = null;
}
