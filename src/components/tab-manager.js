import { generateId } from '../utils/id.js';
import { TerminalPanel } from './terminal-panel.js';
import { FileTree } from './file-tree.js';
import { FileViewer } from './file-viewer.js';
import { BoardView } from './board-view.js';
import { FlowView } from './flow-view.js';
import { bus } from '../utils/events.js';
import { contextMenu } from './context-menu.js';
import { ConfigManager } from './config-manager.js';

class WorkspaceTab {
  constructor(id, name, cwd) {
    this.id = id;
    this.name = name;
    this.cwd = cwd;
    this.noShortcut = false;
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
    bus.on('terminal:cwdChanged', ({ id, cwd }) => {
      this._onTerminalCwdChanged(id, cwd);
      this.configManager.scheduleAutoSave();
    });

    // Listen for new terminals created via split
    bus.on('terminal:created', ({ id, cwd }) => {
      const tab = this._findTabForTerminal(id) || this.tabs.get(this.activeTabId);
      if (tab && tab.fileTree) {
        tab.fileTree.setTerminalRoot(id, cwd);
      }
      this.configManager.scheduleAutoSave();
    });

    // Listen for terminal removals
    bus.on('terminal:removed', ({ id }) => {
      for (const [, tab] of this.tabs) {
        if (tab.fileTree) tab.fileTree.removeTerminal(id);
      }
      this.configManager.scheduleAutoSave();
    });

    // Listen for split resize changes
    bus.on('layout:changed', () => {
      this.configManager.scheduleAutoSave();
    });
  }

  // Find which tab owns a terminal
  _findTabForTerminal(termId) {
    for (const [, tab] of this.tabs) {
      if (tab.terminalPanel?.terminals?.has(termId)) return tab;
    }
    return null;
  }

  // ===== Activity Bar =====

  renderActivityBar() {
    const activityBar = document.getElementById('activity-bar');
    if (!activityBar) return;
    activityBar.innerHTML = '';

    const topSection = document.createElement('div');
    topSection.className = 'activity-bar-top';

    // Work button
    const workBtn = document.createElement('button');
    workBtn.className = 'activity-btn';
    if (this.sidebarMode === 'work') workBtn.classList.add('active');
    workBtn.textContent = 'work';
    workBtn.addEventListener('click', () => this.setSidebarMode('work'));
    topSection.appendChild(workBtn);

    // Board button
    const boardBtn = document.createElement('button');
    boardBtn.className = 'activity-btn';
    if (this.sidebarMode === 'board') boardBtn.classList.add('active');
    boardBtn.textContent = 'BOARD';
    boardBtn.addEventListener('click', () => this.setSidebarMode('board'));
    topSection.appendChild(boardBtn);

    // Flow button
    const flowBtn = document.createElement('button');
    flowBtn.className = 'activity-btn';
    if (this.sidebarMode === 'flow') flowBtn.classList.add('active');
    flowBtn.textContent = 'FLOW';
    flowBtn.addEventListener('click', () => this.setSidebarMode('flow'));
    topSection.appendChild(flowBtn);

    // More button
    const moreBtn = document.createElement('button');
    moreBtn.className = 'activity-btn';
    moreBtn.textContent = '\u2026';
    topSection.appendChild(moreBtn);

    activityBar.appendChild(topSection);

    // Bottom section with settings
    const bottomSection = document.createElement('div');
    bottomSection.className = 'activity-bar-bottom';

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'activity-btn activity-btn-settings';
    settingsBtn.innerHTML = '<span class="activity-btn-icon">&#9881;</span>Settings';
    settingsBtn.addEventListener('click', () => {
      if (this.onOpenSettings) this.onOpenSettings();
    });
    bottomSection.appendChild(settingsBtn);

    activityBar.appendChild(bottomSection);
  }

  setSidebarMode(mode) {
    if (mode === this.sidebarMode) return;

    const prevMode = this.sidebarMode;
    this.sidebarMode = mode;

    // Detach previous view
    if (prevMode === 'work') {
      if (this.activeTabId) {
        const prev = this.tabs.get(this.activeTabId);
        if (prev && prev.layoutElement) {
          this._capturePanelWidths(prev);
          prev.layoutElement.remove();
        }
      }
    } else if (prevMode === 'board') {
      if (this._boardContainerEl) this._boardContainerEl.remove();
    } else if (prevMode === 'flow') {
      if (this._flowContainerEl) this._flowContainerEl.remove();
    }

    // Attach new view
    if (mode === 'board') {
      this.renderBoard();
    } else if (mode === 'flow') {
      this.renderFlow();
    } else {
      // work
      const tab = this.tabs.get(this.activeTabId);
      if (tab) {
        if (tab.layoutElement) {
          this.workspaceContainer.innerHTML = '';
          this.workspaceContainer.appendChild(tab.layoutElement);
          if (tab.terminalPanel) {
            tab.terminalPanel.fitAll();
            if (tab.terminalPanel.activeTerminal) {
              tab.terminalPanel.activeTerminal.terminal.focus();
            }
          }
        } else {
          this.renderWorkspace(tab);
        }
      }
    }

    this.renderActivityBar();
  }

  switchToBoard() {
    this.setSidebarMode('board');
  }

  // ===== Board =====

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

  renderBoard() {
    this.workspaceContainer.innerHTML = '';

    if (this.boardView && this._boardContainerEl) {
      // Reattach existing board (keeps output history)
      this.workspaceContainer.appendChild(this._boardContainerEl);
      // Refit all card terminals
      for (const [, card] of this.boardView.cards) {
        try { card.fitAddon.fit(); } catch {}
      }
      // Rescan for new/removed agents
      this.boardView.scanAgents();
    } else {
      // First time: create board
      const container = document.createElement('div');
      container.style.height = '100%';
      this.workspaceContainer.appendChild(container);
      this._boardContainerEl = container;
      this.boardView = new BoardView(container, this);
    }
  }

  // ===== Flow =====

  renderFlow() {
    this.workspaceContainer.innerHTML = '';

    if (this.flowView && this._flowContainerEl) {
      this.workspaceContainer.appendChild(this._flowContainerEl);
      this.flowView.refresh();
    } else {
      const container = document.createElement('div');
      container.style.height = '100%';
      this.workspaceContainer.appendChild(container);
      this._flowContainerEl = container;
      this.flowView = new FlowView(container, this);
    }
  }

  // ===== Auto Save (delegated to ConfigManager) =====

  autoSave() {
    return this.configManager.autoSave();
  }

  // ===== Tab Management =====

  createTab(name = null) {
    const id = generateId('tab');
    const tabName = name || `Workspace ${this.tabs.size + 1}`;
    const tab = new WorkspaceTab(id, tabName, this.defaultCwd || '/');
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
    if (!tab || id === this.activeTabId) return;

    // If in board mode, switch back to work mode
    if (this.sidebarMode === 'board') {
      if (this._boardContainerEl) {
        this._boardContainerEl.remove();
      }
      this.sidebarMode = 'work';
      this.renderActivityBar();
    }

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
      // Reattach existing layout (terminals stay alive!)
      this.workspaceContainer.innerHTML = '';
      this.workspaceContainer.appendChild(tab.layoutElement);
      if (tab.terminalPanel) {
        tab.terminalPanel.fitAll();
        if (tab.terminalPanel.activeTerminal) {
          tab.terminalPanel.activeTerminal.terminal.focus();
        }
      }
      // Sync file tree with current terminal CWDs
      if (tab.fileTree && tab.terminalPanel) {
        for (const [termId, node] of tab.terminalPanel.terminals) {
          tab.fileTree.setTerminalRoot(termId, node.terminal.cwd);
        }
      }
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
    this.tabBar.innerHTML = '';

    this._tabElements = new Map(); // id -> DOM element (for drag targeting)

    for (const [id, tab] of this.tabs) {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab';
      tabEl.dataset.tabId = id;
      if (id === this.activeTabId) tabEl.classList.add('active');
      if (tab.noShortcut) tabEl.classList.add('tab-no-shortcut');

      const nameEl = document.createElement('span');
      nameEl.className = 'tab-name';
      nameEl.textContent = tab.name;
      nameEl.addEventListener('dblclick', () => this.renameTab(id, nameEl));
      tabEl.appendChild(nameEl);

      // Show close button when there are more than 1 tab
      if (this.tabs.size > 1) {
        const closeEl = document.createElement('span');
        closeEl.className = 'tab-close';
        closeEl.textContent = '\u00d7';
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
        contextMenu.show(e.clientX, e.clientY, [
          { label: 'Rename', action: () => this.renameTab(id, nameEl) },
          {
            label: tab.noShortcut ? '\u2713 NoShortcut' : 'NoShortcut',
            action: () => this.toggleNoShortcut(id),
          },
          { separator: true },
          { label: 'Close', action: () => this.closeTab(id) },
        ]);
      });

      this.tabBar.appendChild(tabEl);
      this._tabElements.set(id, tabEl);
    }

    // Add tab button
    const addBtn = document.createElement('div');
    addBtn.className = 'tab tab-add';
    addBtn.textContent = '+';
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
        if (!dragging && Math.abs(ev.clientX - startX) > 5) {
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

      // Tabs that need to shift to make room
      const effectiveIdx = i > dragIdx ? i : i;
      const effectiveInsert = insertIdx > dragIdx ? insertIdx : insertIdx;

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
    this.workspaceContainer.innerHTML = '';

    // Build 3-panel layout
    const layout = document.createElement('div');
    layout.className = 'workspace-layout';

    // --- Left Panel: File Tree ---
    const leftPanel = document.createElement('div');
    leftPanel.className = 'panel panel-left';

    const leftHeader = document.createElement('div');
    leftHeader.className = 'panel-header';
    leftHeader.innerHTML = '<span class="panel-title">Explorer</span>';
    leftPanel.appendChild(leftHeader);

    const treeContainer = document.createElement('div');
    treeContainer.className = 'file-tree';
    leftPanel.appendChild(treeContainer);

    // Config bar at bottom of left panel
    const configBar = document.createElement('button');
    configBar.className = 'config-bar-btn';
    configBar.innerHTML = `<span class="config-bar-icon">&#9776;</span><span class="config-bar-name">${this.configManager.currentConfigName || 'Default'}</span>`;
    configBar.addEventListener('click', (e) => {
      e.stopPropagation();
      this.configManager.showConfigMenu(configBar);
    });
    this.configManager._configBarEl = configBar;
    leftPanel.appendChild(configBar);

    // --- Left resize handle ---
    const leftHandle = document.createElement('div');
    leftHandle.className = 'panel-resize-handle';
    this.setupPanelResize(leftHandle, leftPanel, 'left');

    // --- Center Panel: Terminals ---
    const centerPanel = document.createElement('div');
    centerPanel.className = 'panel panel-center';

    const centerHeader = document.createElement('div');
    centerHeader.className = 'panel-header';

    const pathInfo = document.createElement('div');
    pathInfo.className = 'path-info';

    const pathArrowLeft = document.createElement('span');
    pathArrowLeft.className = 'path-arrow';
    pathArrowLeft.textContent = '\u2190';
    pathArrowLeft.title = 'Collapse left panel';
    pathArrowLeft.addEventListener('click', () => this.togglePanel(leftPanel, 'left'));

    const pathText = document.createElement('span');
    pathText.className = 'path-text';
    pathText.textContent = tab.cwd;

    const branchBadge = document.createElement('span');
    branchBadge.className = 'branch-badge';
    branchBadge.textContent = '';

    const pathArrowRight = document.createElement('span');
    pathArrowRight.className = 'path-arrow';
    pathArrowRight.textContent = '\u2192';
    pathArrowRight.title = 'Collapse right panel';
    pathArrowRight.addEventListener('click', () => this.togglePanel(rightPanel, 'right'));

    pathInfo.appendChild(pathArrowLeft);
    pathInfo.appendChild(pathText);
    pathInfo.appendChild(branchBadge);
    pathInfo.appendChild(pathArrowRight);
    centerHeader.appendChild(pathInfo);

    const termLabel = document.createElement('div');
    termLabel.className = 'term-label';
    termLabel.textContent = 'Terminal';
    centerHeader.appendChild(termLabel);

    centerPanel.appendChild(centerHeader);

    const termContainer = document.createElement('div');
    termContainer.className = 'terminal-area';
    centerPanel.appendChild(termContainer);

    // --- Right resize handle ---
    const rightHandle = document.createElement('div');
    rightHandle.className = 'panel-resize-handle';

    // --- Right Panel: File Viewer ---
    const rightPanel = document.createElement('div');
    rightPanel.className = 'panel panel-right';

    const viewerContainer = document.createElement('div');
    viewerContainer.className = 'file-viewer';
    rightPanel.appendChild(viewerContainer);

    this.setupPanelResize(rightHandle, rightPanel, 'right');

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
    tab.fileViewer = new FileViewer(viewerContainer);

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

      // Register all terminals in the file tree
      for (const [termId, node] of tab.terminalPanel.terminals) {
        tab.fileTree.setTerminalRoot(termId, node.terminal.cwd);
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
  }

  togglePanel(panel, side) {
    panel.classList.toggle('collapsed');
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) {
      setTimeout(() => tab.terminalPanel.fitAll(), 200);
    }
    this.configManager.scheduleAutoSave();
  }

  setupPanelResize(handle, panel, side) {
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newWidth = side === 'left' ? startWidth + dx : startWidth - dx;
      const maxWidth = side === 'right' ? 900 : 500;
      panel.style.width = `${Math.max(150, Math.min(maxWidth, newWidth))}px`;
      panel.style.flex = 'none';

      const tab = this.tabs.get(this.activeTabId);
      if (tab && tab.terminalPanel) tab.terminalPanel.fitAll();
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
        splitTree: null,
        panels: {},
      };

      // Serialize terminal tree (works for both active and detached layouts)
      if (tab.terminalPanel) {
        tabData.splitTree = tab.terminalPanel.serialize();
      }

      // Panel widths
      const isActive = id === this.activeTabId;
      if (isActive && tab.layoutElement) {
        // Active tab: read from live DOM
        const left = tab.layoutElement.querySelector('.panel-left');
        const right = tab.layoutElement.querySelector('.panel-right');
        if (left) {
          tabData.panels.leftWidth = left.getBoundingClientRect().width;
          tabData.panels.leftCollapsed = left.classList.contains('collapsed');
        }
        if (right) {
          tabData.panels.rightWidth = right.getBoundingClientRect().width;
          tabData.panels.rightCollapsed = right.classList.contains('collapsed');
        }
      } else if (tab._panelWidths) {
        // Inactive tab: use cached widths captured at detach time
        tabData.panels = { ...tab._panelWidths };
      }

      tabs.push(tabData);
      i++;
    }

    return { tabs, activeTabIndex };
  }

  _disposeAllTabs() {
    for (const [id, tab] of [...this.tabs]) {
      if (tab.terminalPanel) tab.terminalPanel.dispose();
      if (tab.fileTree) tab.fileTree.dispose();
      if (tab.layoutElement) tab.layoutElement.remove();
      this.tabs.delete(id);
    }
    this.activeTabId = null;
  }

  async restoreConfig(config) {
    if (!config || !config.tabs || config.tabs.length === 0) return;

    this.configManager.isRestoring = true;

    // Reset board view (old terminal IDs will be invalid)
    this._disposeBoard();
    this._disposeAllTabs();

    // Create tabs from config
    for (const tabData of config.tabs) {
      const id = generateId('tab');
      const tab = new WorkspaceTab(id, tabData.name, tabData.cwd || this.defaultCwd || '/');
      tab.noShortcut = tabData.noShortcut || false;
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

  // ===== NoShortcut =====

  toggleNoShortcut(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;
    tab.noShortcut = !tab.noShortcut;
    this.renderTabBar();
    this.configManager.scheduleAutoSave();
  }

  isActiveNoShortcut() {
    const tab = this.tabs.get(this.activeTabId);
    return tab ? tab.noShortcut : false;
  }

  // ===== Shortcut helpers =====

  splitHorizontal() {
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) tab.terminalPanel.splitActive('horizontal');
  }

  splitVertical() {
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) tab.terminalPanel.splitActive('vertical');
  }

  focusDirection(direction) {
    if (this.sidebarMode === 'board' && this.boardView) {
      this.boardView.focusDirection(direction);
      return;
    }
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) tab.terminalPanel.focusDirection(direction);
  }

  nextTab() {
    const ids = Array.from(this.tabs.keys());
    if (ids.length < 2) return;
    const idx = ids.indexOf(this.activeTabId);
    for (let i = 1; i < ids.length; i++) {
      const candidate = ids[(idx + i) % ids.length];
      if (!this.tabs.get(candidate).noShortcut) {
        this.switchTo(candidate);
        return;
      }
    }
  }

  prevTab() {
    const ids = Array.from(this.tabs.keys());
    if (ids.length < 2) return;
    const idx = ids.indexOf(this.activeTabId);
    for (let i = 1; i < ids.length; i++) {
      const candidate = ids[(idx - i + ids.length) % ids.length];
      if (!this.tabs.get(candidate).noShortcut) {
        this.switchTo(candidate);
        return;
      }
    }
  }
}
