import { generateId } from '../utils/id.js';
import { TerminalPanel } from './terminal-panel.js';
import { FileTree } from './file-tree.js';
import { FileViewer } from './file-viewer.js';
import { BoardView } from './board-view.js';
import { FlowView } from './flow-view.js';
import { UsageView } from './usage-view.js';
import { bus } from '../utils/events.js';
import { contextMenu } from './context-menu.js';
import { ConfigManager } from './config-manager.js';
import { _el } from '../utils/dom.js';

// ── Constants ──
const DRAG_THRESHOLD = 5;
const PANEL_MIN_WIDTH = 150;
const LEFT_MAX_WIDTH = 500;
const RIGHT_MAX_WIDTH = 900;
const FIT_DELAY_MS = 200;

const ACTIVITY_BUTTONS = [
  { label: 'work', mode: 'work' },
  { label: 'BOARD', mode: 'board' },
  { label: 'FLOW', mode: 'flow' },
  { label: 'USAGE', mode: 'usage' },
];

export const COLOR_GROUPS = [
  { id: 'red', label: 'Red', color: '#e94560' },
  { id: 'blue', label: 'Blue', color: '#74c0fc' },
  { id: 'green', label: 'Green', color: '#51cf66' },
  { id: 'yellow', label: 'Yellow', color: '#ffd43b' },
  { id: 'purple', label: 'Purple', color: '#b197fc' },
  { id: 'orange', label: 'Orange', color: '#ffa94d' },
];

class WorkspaceTab {
  constructor(id, name, cwd) {
    this.id = id;
    this.name = name;
    this.cwd = cwd;
    this.noShortcut = false;
    this.colorGroup = null; // null or COLOR_GROUPS id ('red','blue',...)
    this.fileTree = null;
    this.terminalPanel = null;
    this.fileViewer = null;
    this.layoutElement = null;
    // DOM refs for live updates
    this.pathTextEl = null;
    this.branchBadgeEl = null;
    // Cached panel widths (for detached tabs)
    this._panelWidths = null;
  }
}

export class TabManager {
  constructor(tabBar, workspaceContainer) {
    this.tabBar = tabBar;
    this.workspaceContainer = workspaceContainer;
    this.tabs = new Map();
    this.activeTabId = null;
    this.defaultCwd = null;
    this.onOpenSettings = null;
    this.configManager = new ConfigManager(this);
    this.boardView = null;
    this._boardContainerEl = null;
    this.flowView = null;
    this._flowContainerEl = null;
    this.usageView = null;
    this._usageContainerEl = null;
    this.sidebarMode = 'work';

    this.init();
  }

  async init() {
    this.defaultCwd = await window.api.fs.homedir();

    // Render the activity bar (work/board sidebar)
    this.renderActivityBar();

    // Auto-restore default config on startup
    try {
      const defaultName = await window.api.config.getDefault();
      const defaultConfig = await window.api.config.loadDefault();
      if (defaultConfig && defaultConfig.tabs && defaultConfig.tabs.length > 0) {
        this.configManager.currentConfigName = defaultName;
        await this.restoreConfig(defaultConfig);
      } else {
        this.configManager.currentConfigName = 'Default';
        this.createTab('Workspace 1');
      }
    } catch (e) {
      console.warn('Failed to restore config:', e);
      this.configManager.currentConfigName = 'Default';
      this.createTab('Workspace 1');
    }

    // Listen for cwd changes from any terminal (find owning tab)
    this._busListeners = [];

    const onCwdChanged = ({ id, cwd }) => {
      this._onTerminalCwdChanged(id, cwd);
      this.configManager.scheduleAutoSave();
    };

    const onCreated = ({ id, cwd }) => {
      const tab = this._findTabForTerminal(id) || this.tabs.get(this.activeTabId);
      if (tab && tab.fileTree) {
        tab.fileTree.setTerminalRoot(id, cwd);
      }
      this.configManager.scheduleAutoSave();
    };

    const onRemoved = ({ id }) => {
      for (const [, tab] of this.tabs) {
        if (tab.fileTree) tab.fileTree.removeTerminal(id);
      }
      this.configManager.scheduleAutoSave();
    };

    const onLayoutChanged = () => {
      this.configManager.scheduleAutoSave();
    };

    const onOpenFromFolder = ({ cwd }) => {
      const folderName = cwd.split('/').filter(Boolean).pop() || '/';
      this.createTab(folderName, cwd);
    };

    bus.on('terminal:cwdChanged', onCwdChanged);
    bus.on('terminal:created', onCreated);
    bus.on('terminal:removed', onRemoved);
    bus.on('layout:changed', onLayoutChanged);
    bus.on('workspace:openFromFolder', onOpenFromFolder);

    this._busListeners.push(
      ['terminal:cwdChanged', onCwdChanged],
      ['terminal:created', onCreated],
      ['terminal:removed', onRemoved],
      ['layout:changed', onLayoutChanged],
      ['workspace:openFromFolder', onOpenFromFolder],
    );
  }

  // Find which tab owns a terminal
  _findTabForTerminal(termId) {
    for (const [, tab] of this.tabs) {
      if (tab.terminalPanel?.terminals?.has(termId)) return tab;
    }
    return null;
  }

  _activeTab() {
    return this.tabs.get(this.activeTabId);
  }

  _reattachLayout(tab) {
    this.workspaceContainer.replaceChildren();
    this.workspaceContainer.appendChild(tab.layoutElement);
    if (tab.terminalPanel) {
      tab.terminalPanel.fitAll();
      if (tab.terminalPanel.activeTerminal) {
        tab.terminalPanel.activeTerminal.terminal.focus();
      }
    }
  }

  _syncFileTree(tab) {
    if (tab.fileTree && tab.terminalPanel) {
      for (const [termId, node] of tab.terminalPanel.terminals) {
        tab.fileTree.setTerminalRoot(termId, node.terminal.cwd);
      }
    }
  }

  /** Reattach or create a side-panel view (board, flow, usage). Returns true if reattached. */
  _renderSideView(viewKey, containerKey, ViewClass, ...ctorArgs) {
    this.workspaceContainer.replaceChildren();

    if (this[viewKey] && this[containerKey]) {
      this.workspaceContainer.appendChild(this[containerKey]);
      return true;
    }

    const container = _el('div');
    container.style.height = '100%';
    this.workspaceContainer.appendChild(container);
    this[containerKey] = container;
    this[viewKey] = new ViewClass(container, ...ctorArgs);
    return false;
  }

  // ===== Activity Bar =====

  renderActivityBar() {
    const activityBar = document.getElementById('activity-bar');
    if (!activityBar) return;
    activityBar.replaceChildren();

    const topSection = _el('div', 'activity-bar-top');

    for (const { label, mode } of ACTIVITY_BUTTONS) {
      const btn = _el('button', 'activity-btn', label);
      if (this.sidebarMode === mode) btn.classList.add('active');
      btn.addEventListener('click', () => this.setSidebarMode(mode));
      topSection.appendChild(btn);
    }

    topSection.appendChild(_el('button', 'activity-btn', '\u2026'));
    activityBar.appendChild(topSection);

    // Bottom section with settings
    const bottomSection = _el('div', 'activity-bar-bottom');
    const settingsBtn = _el('button', 'activity-btn activity-btn-settings');
    settingsBtn.append(_el('span', 'activity-btn-icon', '\u2699'), 'Settings');
    settingsBtn.addEventListener('click', () => {
      if (this.onOpenSettings) this.onOpenSettings();
    });
    bottomSection.appendChild(settingsBtn);

    activityBar.appendChild(bottomSection);
  }

  _detachSidebarView(mode) {
    if (mode === 'work') {
      const prev = this._activeTab();
      if (prev?.layoutElement) {
        this._capturePanelWidths(prev);
        prev.layoutElement.remove();
      }
    } else if (mode === 'board') {
      this.boardView?.pause();
      this._boardContainerEl?.remove();
    } else if (mode === 'flow') {
      this._disposeFlow();
    } else if (mode === 'usage') {
      this._disposeUsage();
    }
  }

  setSidebarMode(mode) {
    if (mode === this.sidebarMode) return;

    this._detachSidebarView(this.sidebarMode);
    this.sidebarMode = mode;

    if (mode === 'board') {
      this.renderBoard();
    } else if (mode === 'flow') {
      this.renderFlow();
    } else if (mode === 'usage') {
      this.renderUsage();
    } else {
      const tab = this._activeTab();
      if (tab?.layoutElement) {
        this._reattachLayout(tab);
      } else if (tab) {
        this.renderWorkspace(tab);
      }
    }

    this.renderActivityBar();
  }

  switchToBoard() {
    this.setSidebarMode('board');
  }

  // ===== Side view disposal =====

  _disposeBoard() {
    if (this.boardView) {
      this.boardView.dispose();
      this.boardView = null;
    }
    if (this._boardContainerEl) {
      this._boardContainerEl.remove();
      this._boardContainerEl = null;
    }
  }

  _disposeFlow() {
    if (this.flowView) {
      this.flowView.dispose();
      this.flowView = null;
    }
    if (this._flowContainerEl) {
      this._flowContainerEl.remove();
      this._flowContainerEl = null;
    }
  }

  _disposeUsage() {
    if (this.usageView) {
      this.usageView.dispose();
      this.usageView = null;
    }
    if (this._usageContainerEl) {
      this._usageContainerEl.remove();
      this._usageContainerEl = null;
    }
  }

  renderBoard() {
    if (this._renderSideView('boardView', '_boardContainerEl', BoardView, this)) {
      for (const [, card] of this.boardView.cards) {
        try { card.fitAddon.fit(); } catch {}
      }
      this.boardView.resume();
    }
  }

  // ===== Flow =====

  renderFlow() {
    if (this._renderSideView('flowView', '_flowContainerEl', FlowView, this)) {
      this.flowView.refresh();
    }
  }

  // ===== Usage =====

  renderUsage() {
    if (this._renderSideView('usageView', '_usageContainerEl', UsageView)) {
      this.usageView.refresh();
    }
  }

  // ===== Auto Save (delegated to ConfigManager) =====

  autoSave() {
    return this.configManager.autoSave();
  }

  // ===== Tab Management =====

  createTab(name = null, cwd = null) {
    const id = generateId('tab');
    const tabName = name || `Workspace ${this.tabs.size + 1}`;
    const tab = new WorkspaceTab(id, tabName, cwd || this.defaultCwd || '/');
    this.tabs.set(id, tab);
    this.renderTabBar();
    this.switchTo(id);
    this.configManager.scheduleAutoSave();
    return tab;
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    // Dispose terminal panel (kills PTY processes)
    if (tab.terminalPanel) tab.terminalPanel.dispose();
    if (tab.fileViewer) tab.fileViewer.dispose();
    if (tab.fileTree) tab.fileTree.dispose();
    if (tab.layoutElement) tab.layoutElement.remove();
    this.tabs.delete(id);

    if (this.tabs.size === 0) {
      this.createTab();
      return;
    }

    if (this.activeTabId === id) {
      const remaining = Array.from(this.tabs.values());
      this.switchTo(remaining[0].id);
    }

    this.renderTabBar();
    this.configManager.scheduleAutoSave();
  }

  switchTo(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    // If in a non-work mode, switch back to work mode
    if (this.sidebarMode !== 'work') {
      this._detachSidebarView(this.sidebarMode);
      this.sidebarMode = 'work';
      this.renderActivityBar();

      // If this tab is already active, just re-show its layout
      if (id === this.activeTabId) {
        if (tab.layoutElement) {
          this._reattachLayout(tab);
          this._syncFileTree(tab);
          bus.emit('workspace:activated');
        }
        this.renderTabBar();
        return;
      }
    }

    if (id === this.activeTabId) return;

    // Detach outgoing tab (keep terminals alive!)
    if (this.activeTabId) {
      const prev = this.tabs.get(this.activeTabId);
      if (prev && prev.layoutElement) {
        // Capture panel widths before detaching (needs attached DOM)
        this._capturePanelWidths(prev);
        prev.layoutElement.remove();
      }
    }

    this.activeTabId = id;
    this.renderTabBar();

    if (tab.layoutElement) {
      this._reattachLayout(tab);
      this._syncFileTree(tab);
      bus.emit('workspace:activated');
    } else {
      // First time rendering this tab
      this.renderWorkspace(tab);
    }
  }

  _capturePanelWidths(tab) {
    if (!tab.layoutElement) return;
    const left = tab.layoutElement.querySelector('.panel-left');
    const right = tab.layoutElement.querySelector('.panel-right');
    tab._panelWidths = {};
    if (left) {
      tab._panelWidths.leftWidth = left.getBoundingClientRect().width;
      tab._panelWidths.leftCollapsed = left.classList.contains('collapsed');
    }
    if (right) {
      tab._panelWidths.rightWidth = right.getBoundingClientRect().width;
      tab._panelWidths.rightCollapsed = right.classList.contains('collapsed');
    }
  }

  // ===== Tab Bar Rendering =====

  renderTabBar() {
    this.tabBar.replaceChildren();

    this._tabElements = new Map(); // id -> DOM element (for drag targeting)

    for (const [id, tab] of this.tabs) {
      const tabEl = _el('div', 'tab');
      tabEl.dataset.tabId = id;
      if (id === this.activeTabId) tabEl.classList.add('active');
      if (tab.noShortcut) tabEl.classList.add('tab-no-shortcut');

      // Color group indicator
      if (tab.colorGroup) {
        const cg = COLOR_GROUPS.find((c) => c.id === tab.colorGroup);
        if (cg) {
          const dot = _el('span', 'tab-color-dot');
          dot.style.background = cg.color;
          tabEl.appendChild(dot);
          tabEl.style.borderBottomColor = id === this.activeTabId ? cg.color : '';
        }
      }

      const nameEl = _el('span', 'tab-name', tab.name);
      nameEl.addEventListener('dblclick', () => this.renameTab(id, nameEl));
      tabEl.appendChild(nameEl);

      // Show close button when there are more than 1 tab
      if (this.tabs.size > 1) {
        const closeEl = _el('span', 'tab-close', '\u00d7');
        closeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeTab(id);
        });
        tabEl.appendChild(closeEl);
      }

      tabEl.addEventListener('click', () => this.switchTo(id));

      // Drag to reorder
      this.setupTabDrag(tabEl, id);

      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const colorItems = COLOR_GROUPS.map((cg) => ({
          label: `${tab.colorGroup === cg.id ? '\u2713 ' : ''}${cg.label}`,
          colorDot: cg.color,
          action: () => this.setTabColorGroup(id, tab.colorGroup === cg.id ? null : cg.id),
        }));
        if (tab.colorGroup) {
          colorItems.push({ label: 'Remove color', action: () => this.setTabColorGroup(id, null) });
        }
        contextMenu.show(e.clientX, e.clientY, [
          { label: 'Rename', action: () => this.renameTab(id, nameEl) },
          {
            label: tab.noShortcut ? '\u2713 NoShortcut' : 'NoShortcut',
            action: () => this.toggleNoShortcut(id),
          },
          { separator: true },
          { label: 'Color Group', children: colorItems },
          { separator: true },
          { label: 'Close', action: () => this.closeTab(id) },
        ]);
      });

      this.tabBar.appendChild(tabEl);
      this._tabElements.set(id, tabEl);
    }

    // Add tab button
    const addBtn = _el('div', 'tab tab-add', '+');
    addBtn.addEventListener('click', () => this.createTab());
    this.tabBar.appendChild(addBtn);
  }

  // ===== Tab Drag & Drop Reorder =====

  setupTabDrag(tabEl, tabId) {
    let startX = 0;
    let dragging = false;
    let ghost = null;
    let offsetX = 0;

    tabEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      startX = e.clientX;
      const rect = tabEl.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      dragging = false;

      const onMouseMove = (ev) => {
        if (!dragging && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD) {
          dragging = true;
          tabEl.classList.add('tab-dragging');
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';

          // Create floating ghost clone
          ghost = tabEl.cloneNode(true);
          ghost.className = 'tab tab-ghost';
          if (tabEl.classList.contains('active')) ghost.classList.add('active');
          const r = tabEl.getBoundingClientRect();
          ghost.style.width = `${r.width}px`;
          ghost.style.height = `${r.height}px`;
          ghost.style.top = `${r.top}px`;
          document.body.appendChild(ghost);
        }
        if (dragging && ghost) {
          ghost.style.left = `${ev.clientX - offsetX}px`;
          this._updateTabDropTarget(ev.clientX, tabId);
        }
      };

      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        if (dragging) {
          tabEl.classList.remove('tab-dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          if (ghost) { ghost.remove(); ghost = null; }
          this._clearTabShifts();

          if (this._tabDropTargetId && this._tabDropTargetId !== tabId) {
            this.reorderTab(tabId, this._tabDropTargetId, this._tabDropBefore);
          }
          this._tabDropTargetId = null;
          this._tabDropBefore = null;
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _clearTabShifts() {
    for (const [, el] of this._tabElements) {
      el.style.transform = '';
      el.style.transition = '';
    }
  }

  _updateTabDropTarget(mx, dragId) {
    this._tabDropTargetId = null;
    this._tabDropBefore = true;

    // Get ordered tab IDs
    const orderedIds = Array.from(this._tabElements.keys());

    // Find the dragged tab's width for shift amount
    const dragEl = this._tabElements.get(dragId);
    const shiftAmount = dragEl ? dragEl.getBoundingClientRect().width : 0;

    // Determine insertion index based on mouse position
    let insertIdx = -1;
    const dragIdx = orderedIds.indexOf(dragId);

    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (id === dragId) continue;
      const el = this._tabElements.get(id);
      const rect = el.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;

      if (mx < midX) {
        this._tabDropTargetId = id;
        this._tabDropBefore = true;
        insertIdx = i;
        break;
      }
    }

    // If no target found, insert after last
    if (insertIdx === -1) {
      const lastId = orderedIds.filter((id) => id !== dragId).pop();
      if (lastId) {
        this._tabDropTargetId = lastId;
        this._tabDropBefore = false;
        insertIdx = orderedIds.length;
      }
    }

    // Shift tabs to make visual gap
    for (let i = 0; i < orderedIds.length; i++) {
      const id = orderedIds[i];
      if (id === dragId) continue;
      const el = this._tabElements.get(id);
      el.style.transition = 'transform 0.2s ease';

      if (dragIdx < insertIdx) {
        // Dragging right: shift left the tabs between old and new position
        el.style.transform = (i > dragIdx && i < insertIdx) ? `translateX(${-shiftAmount}px)` : '';
      } else if (dragIdx > insertIdx) {
        // Dragging left: shift right the tabs between new and old position
        el.style.transform = (i >= insertIdx && i < dragIdx) ? `translateX(${shiftAmount}px)` : '';
      } else {
        el.style.transform = '';
      }
    }
  }

  reorderTab(fromId, toId, before) {
    if (fromId === toId) return;

    // Rebuild the Map in new order
    const entries = Array.from(this.tabs.entries());
    const fromIdx = entries.findIndex(([id]) => id === fromId);
    const fromEntry = entries.splice(fromIdx, 1)[0];

    let toIdx = entries.findIndex(([id]) => id === toId);
    if (!before) toIdx++;
    entries.splice(toIdx, 0, fromEntry);

    this.tabs = new Map(entries);
    this.renderTabBar();
    this.configManager.scheduleAutoSave();
  }

  renameTab(id, nameEl) {
    const tab = this.tabs.get(id);
    const input = document.createElement('input');
    input.className = 'tab-rename-input';
    input.value = tab.name;
    nameEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      tab.name = input.value || tab.name;
      this.renderTabBar();
      this.configManager.scheduleAutoSave();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') this.renderTabBar();
    });
  }

  // ===== Workspace Rendering (called only once per tab) =====

  async renderWorkspace(tab) {
    this.workspaceContainer.replaceChildren();

    // Build 3-panel layout
    const layout = _el('div', 'workspace-layout');

    // --- Left Panel: File Tree ---
    const leftPanel = _el('div', 'panel panel-left');
    const leftHeader = _el('div', 'panel-header');
    leftHeader.appendChild(_el('span', 'panel-title', 'Explorer'));
    leftPanel.appendChild(leftHeader);

    const treeContainer = _el('div', 'file-tree');
    leftPanel.appendChild(treeContainer);

    // --- Left resize handle ---
    const leftHandle = _el('div', 'panel-resize-handle');
    this.setupPanelResize(leftHandle, leftPanel, 'left');

    // --- Right Panel: File Viewer ---
    const rightPanel = _el('div', 'panel panel-right');
    const viewerContainer = _el('div', 'file-viewer');
    rightPanel.appendChild(viewerContainer);

    const rightHandle = _el('div', 'panel-resize-handle');
    this.setupPanelResize(rightHandle, rightPanel, 'right');

    // --- Center Panel: Terminals ---
    const centerPanel = _el('div', 'panel panel-center');
    const centerHeader = _el('div', 'panel-header');

    const pathInfo = _el('div', 'path-info');

    const pathArrowLeft = _el('span', 'path-arrow', '\u2190');
    pathArrowLeft.title = 'Collapse left panel';
    pathArrowLeft.addEventListener('click', () => this.togglePanel(leftPanel, 'left', pathArrowLeft));

    const pathText = _el('span', 'path-text', tab.cwd);
    const branchBadge = _el('span', 'branch-badge', '');

    const pathArrowRight = _el('span', 'path-arrow', '\u2192');
    pathArrowRight.title = 'Collapse right panel';
    pathArrowRight.addEventListener('click', () => this.togglePanel(rightPanel, 'right', pathArrowRight));

    pathInfo.append(pathArrowLeft, pathText, branchBadge, pathArrowRight);
    centerHeader.appendChild(pathInfo);
    centerHeader.appendChild(_el('div', 'term-label', 'Terminal'));
    centerPanel.appendChild(centerHeader);

    const termContainer = _el('div', 'terminal-area');
    centerPanel.appendChild(termContainer);

    layout.appendChild(leftPanel);
    layout.appendChild(leftHandle);
    layout.appendChild(centerPanel);
    layout.appendChild(rightHandle);
    layout.appendChild(rightPanel);
    this.workspaceContainer.appendChild(layout);

    // Store layout on tab for persistence
    tab.layoutElement = layout;

    // Store DOM refs for live cwd updates
    tab.pathTextEl = pathText;
    tab.branchBadgeEl = branchBadge;

    // Initialize components
    tab.fileTree = new FileTree(treeContainer);
    tab.fileViewer = new FileViewer(viewerContainer, () => tab.id === this.activeTabId);

    // Restore split tree if available, otherwise create default
    if (tab._restoreData && tab._restoreData.splitTree) {
      tab.terminalPanel = new TerminalPanel(termContainer, tab.cwd);
      tab.terminalPanel.restoreFromTree(tab._restoreData.splitTree);

      // Restore panel sizes
      const panels = tab._restoreData.panels;
      if (panels) {
        if (panels.leftWidth && !panels.leftCollapsed) {
          leftPanel.style.width = `${panels.leftWidth}px`;
          leftPanel.style.flex = 'none';
        }
        if (panels.leftCollapsed) leftPanel.classList.add('collapsed');
        if (panels.rightWidth && !panels.rightCollapsed) {
          rightPanel.style.width = `${panels.rightWidth}px`;
          rightPanel.style.flex = 'none';
        }
        if (panels.rightCollapsed) rightPanel.classList.add('collapsed');
      }

      this._syncFileTree(tab);

      // Restore webview tabs into file viewer
      if (tab._restoreData.webviewTabs && tab.fileViewer) {
        tab.fileViewer.setWebviewTabs(tab._restoreData.webviewTabs);
      }

      delete tab._restoreData;
    } else {
      tab.terminalPanel = new TerminalPanel(termContainer, tab.cwd);

      // Register the first terminal in the file tree
      const firstTermId = tab.terminalPanel.activeTerminal?.terminal?.id;
      if (firstTermId) {
        tab.fileTree.setTerminalRoot(firstTermId, tab.cwd);
      }
    }

    // Fetch git branch
    const branch = await window.api.git.branch(tab.cwd);
    if (branch) {
      branchBadge.textContent = ` ${branch}`;
    }

    // Load pinned files into this new workspace
    bus.emit('workspace:activated');
  }

  togglePanel(panel, side, arrowEl) {
    panel.classList.add('animating');
    panel.classList.toggle('collapsed');
    const isCollapsed = panel.classList.contains('collapsed');

    if (arrowEl) {
      if (side === 'left') {
        arrowEl.textContent = isCollapsed ? '\u2192' : '\u2190';
        arrowEl.title = isCollapsed ? 'Expand left panel' : 'Collapse left panel';
      } else {
        arrowEl.textContent = isCollapsed ? '\u2190' : '\u2192';
        arrowEl.title = isCollapsed ? 'Expand right panel' : 'Collapse right panel';
      }
    }

    setTimeout(() => {
      panel.classList.remove('animating');
      this._activeTab()?.terminalPanel?.fitAll();
    }, FIT_DELAY_MS);
    this.configManager.scheduleAutoSave();
  }

  setupPanelResize(handle, panel, side) {
    let startX = 0;
    let startWidth = 0;
    let rafPending = false;

    const onMouseMove = (e) => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        const dx = e.clientX - startX;
        const newWidth = side === 'left' ? startWidth + dx : startWidth - dx;
        const maxWidth = side === 'right' ? RIGHT_MAX_WIDTH : LEFT_MAX_WIDTH;
        panel.style.width = `${Math.max(PANEL_MIN_WIDTH, Math.min(maxWidth, newWidth))}px`;
        panel.style.flex = 'none';
        this._activeTab()?.terminalPanel?.fitAll();
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.configManager.scheduleAutoSave();
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  // ===== Terminal CWD tracking =====

  _onTerminalCwdChanged(termId, cwd) {
    // Find the tab that owns this terminal
    const tab = this._findTabForTerminal(termId);
    if (!tab) return;

    // Update file tree (works even for inactive tabs)
    if (tab.fileTree) {
      tab.fileTree.setTerminalRoot(termId, cwd);
    }

    // Update header path/branch only for the active tab's active terminal
    if (
      tab.id === this.activeTabId &&
      tab.terminalPanel?.activeTerminal?.terminal?.id === termId
    ) {
      tab.cwd = cwd;
      if (tab.pathTextEl) tab.pathTextEl.textContent = cwd;
      if (tab.branchBadgeEl) {
        window.api.git.branch(cwd).then((branch) => {
          if (tab.branchBadgeEl) {
            tab.branchBadgeEl.textContent = branch ? ` ${branch}` : '';
          }
        });
      }
    }
  }

  // ===== Serialization =====

  serialize() {
    const tabs = [];
    let activeTabIndex = 0;
    let i = 0;

    for (const [id, tab] of this.tabs) {
      if (id === this.activeTabId) activeTabIndex = i;

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
      if (id === this.activeTabId) this._capturePanelWidths(tab);
      if (tab._panelWidths) tabData.panels = { ...tab._panelWidths };

      tabs.push(tabData);
      i++;
    }

    return { tabs, activeTabIndex };
  }

  _disposeAllTabs() {
    for (const [id, tab] of [...this.tabs]) {
      if (tab.terminalPanel) tab.terminalPanel.dispose();
      if (tab.fileViewer) tab.fileViewer.dispose();
      if (tab.fileTree) tab.fileTree.dispose();
      if (tab.layoutElement) tab.layoutElement.remove();
      this.tabs.delete(id);
    }
    this.activeTabId = null;
  }

  dispose() {
    for (const [event, handler] of this._busListeners) {
      bus.off(event, handler);
    }
    this._busListeners = [];
    this._disposeBoard();
    this._disposeFlow();
    this._disposeUsage();
    this._disposeAllTabs();
  }

  async restoreConfig(config) {
    if (!config || !config.tabs || config.tabs.length === 0) return;

    this.configManager.isRestoring = true;

    // Reset side views (old terminal IDs will be invalid)
    this._disposeBoard();
    this._disposeFlow();
    this._disposeUsage();
    this._disposeAllTabs();

    // Create tabs from config
    for (const tabData of config.tabs) {
      const id = generateId('tab');
      const tab = new WorkspaceTab(id, tabData.name, tabData.cwd || this.defaultCwd || '/');
      tab.noShortcut = tabData.noShortcut || false;
      tab.colorGroup = tabData.colorGroup || null;
      tab._restoreData = tabData;
      this.tabs.set(id, tab);
    }

    this.renderTabBar();

    // Switch to the active tab
    const tabIds = Array.from(this.tabs.keys());
    const activeIdx = Math.min(config.activeTabIndex || 0, tabIds.length - 1);
    this.switchTo(tabIds[activeIdx]);

    this.configManager.isRestoring = false;
  }

  // ===== Color Groups =====

  setTabColorGroup(id, colorGroupId) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    tab.colorGroup = colorGroupId;
    this.renderTabBar();
    this.configManager.scheduleAutoSave();
  }

  goToColorGroup(colorGroupId) {
    // Find the first tab in this color group (or the last active one)
    const ids = Array.from(this.tabs.keys());
    // Prefer next tab after current in that color
    const currentIdx = ids.indexOf(this.activeTabId);
    for (let i = 1; i <= ids.length; i++) {
      const candidate = ids[(currentIdx + i) % ids.length];
      const tab = this.tabs.get(candidate);
      if (tab.colorGroup === colorGroupId && !tab.noShortcut) {
        this.switchTo(candidate);
        return;
      }
    }
  }

  // ===== NoShortcut =====

  toggleNoShortcut(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    tab.noShortcut = !tab.noShortcut;
    this.renderTabBar();
    this.configManager.scheduleAutoSave();
  }

  isActiveNoShortcut() {
    return this._activeTab()?.noShortcut ?? false;
  }

  // ===== Shortcut helpers =====

  splitHorizontal() {
    this._activeTab()?.terminalPanel?.splitActive('horizontal');
  }

  splitVertical() {
    this._activeTab()?.terminalPanel?.splitActive('vertical');
  }

  focusDirection(direction) {
    if (this.sidebarMode === 'board' && this.boardView) {
      this.boardView.focusDirection(direction);
      return;
    }
    this._activeTab()?.terminalPanel?.focusDirection(direction);
  }

  _cycleTab(step) {
    const ids = Array.from(this.tabs.keys());
    if (ids.length < 2) return;
    const idx = ids.indexOf(this.activeTabId);
    const activeColor = this._activeTab()?.colorGroup ?? null;
    for (let i = 1; i < ids.length; i++) {
      const candidate = ids[(idx + step * i + ids.length) % ids.length];
      const tab = this.tabs.get(candidate);
      if (tab.noShortcut) continue;
      if ((tab.colorGroup ?? null) !== activeColor) continue;
      this.switchTo(candidate);
      return;
    }
  }

  nextTab() { this._cycleTab(1); }
  prevTab() { this._cycleTab(-1); }
}
