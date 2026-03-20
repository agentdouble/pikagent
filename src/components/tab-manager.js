import { generateId } from '../utils/id.js';
import { TerminalPanel } from './terminal-panel.js';
import { FileTree } from './file-tree.js';
import { FileViewer } from './file-viewer.js';
import { bus } from '../utils/events.js';
import { contextMenu } from './context-menu.js';

class WorkspaceTab {
  constructor(id, name, cwd) {
    this.id = id;
    this.name = name;
    this.cwd = cwd;
    this.fileTree = null;
    this.terminalPanel = null;
    this.fileViewer = null;
    this.element = null;
    // DOM refs for live updates
    this.pathTextEl = null;
    this.branchBadgeEl = null;
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

    this.init();
  }

  async init() {
    this.defaultCwd = await window.api.fs.homedir();
    this.createTab('Workspace 1');

    // Listen for terminal exits
    bus.on('terminal:exited', ({ id }) => {
      // The terminal panel handles cleanup
    });

    // Listen for cwd changes from any terminal
    bus.on('terminal:cwdChanged', ({ id, cwd }) => {
      this.onTerminalCwdChanged(id, cwd);
    });

    // Listen for new terminals created via split
    bus.on('terminal:created', ({ id, cwd }) => {
      const tab = this.tabs.get(this.activeTabId);
      if (tab && tab.fileTree) {
        tab.fileTree.setTerminalRoot(id, cwd);
      }
    });

    // Listen for terminal removals
    bus.on('terminal:removed', ({ id }) => {
      const tab = this.tabs.get(this.activeTabId);
      if (tab && tab.fileTree) {
        tab.fileTree.removeTerminal(id);
      }
    });
  }

  createTab(name = null) {
    const id = generateId('tab');
    const tabName = name || `Workspace ${this.tabs.size + 1}`;
    const tab = new WorkspaceTab(id, tabName, this.defaultCwd || '/');
    this.tabs.set(id, tab);
    this.renderTabBar();
    this.switchTo(id);
    return tab;
  }

  closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    // Dispose terminal panel
    if (tab.terminalPanel) tab.terminalPanel.dispose();

    this.tabs.delete(id);

    if (this.tabs.size === 0) {
      this.createTab();
      return;
    }

    if (this.activeTabId === id) {
      const firstId = this.tabs.keys().next().value;
      this.switchTo(firstId);
    }

    this.renderTabBar();
  }

  switchTo(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    this.activeTabId = id;
    this.renderTabBar();
    this.renderWorkspace(tab);
  }

  renderTabBar() {
    this.tabBar.innerHTML = '';

    for (const [id, tab] of this.tabs) {
      const tabEl = document.createElement('div');
      tabEl.className = 'tab';
      if (id === this.activeTabId) tabEl.classList.add('active');

      const nameEl = document.createElement('span');
      nameEl.className = 'tab-name';
      nameEl.textContent = tab.name;
      nameEl.addEventListener('dblclick', () => this.renameTab(id, nameEl));
      tabEl.appendChild(nameEl);

      if (this.tabs.size > 1) {
        const closeEl = document.createElement('span');
        closeEl.className = 'tab-close';
        closeEl.textContent = '×';
        closeEl.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeTab(id);
        });
        tabEl.appendChild(closeEl);
      }

      tabEl.addEventListener('click', () => this.switchTo(id));
      tabEl.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextMenu.show(e.clientX, e.clientY, [
          {
            label: 'Rename',
            action: () => this.renameTab(id, nameEl),
          },
          { separator: true },
          {
            label: 'Close',
            action: () => this.closeTab(id),
          },
        ]);
      });
      this.tabBar.appendChild(tabEl);
    }

    // Add tab button
    const addBtn = document.createElement('div');
    addBtn.className = 'tab tab-add';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', () => this.createTab());
    this.tabBar.appendChild(addBtn);
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
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') commit();
      if (e.key === 'Escape') this.renderTabBar();
    });
  }

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

    // Gear button at bottom of left panel
    const gearBtn = document.createElement('button');
    gearBtn.className = 'settings-gear-btn';
    gearBtn.innerHTML = '<span class="settings-gear-icon">&#9881;</span> Settings';
    gearBtn.addEventListener('click', () => {
      if (this.onOpenSettings) this.onOpenSettings();
    });
    leftPanel.appendChild(gearBtn);

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
    pathArrowLeft.textContent = '←';
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
    pathArrowRight.textContent = '→';
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

    // Store DOM refs for live cwd updates
    tab.pathTextEl = pathText;
    tab.branchBadgeEl = branchBadge;

    // Initialize components
    tab.fileTree = new FileTree(treeContainer);
    tab.terminalPanel = new TerminalPanel(termContainer, tab.cwd);
    tab.fileViewer = new FileViewer(viewerContainer);

    // Register the first terminal in the file tree
    const firstTermId = tab.terminalPanel.activeTerminal?.terminal?.id;
    if (firstTermId) {
      tab.fileTree.setTerminalRoot(firstTermId, tab.cwd);
    }

    // Fetch git branch
    const branch = await window.api.git.branch(tab.cwd);
    if (branch) {
      branchBadge.textContent = ` ${branch}`;
    }
  }

  togglePanel(panel, side) {
    panel.classList.toggle('collapsed');
    // Refit terminals
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) {
      setTimeout(() => tab.terminalPanel.fitAll(), 200);
    }
  }

  setupPanelResize(handle, panel, side) {
    let startX = 0;
    let startWidth = 0;

    const onMouseMove = (e) => {
      const dx = e.clientX - startX;
      const newWidth = side === 'left' ? startWidth + dx : startWidth - dx;
      panel.style.width = `${Math.max(150, Math.min(500, newWidth))}px`;
      panel.style.flex = 'none';

      const tab = this.tabs.get(this.activeTabId);
      if (tab && tab.terminalPanel) tab.terminalPanel.fitAll();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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

  async onTerminalCwdChanged(termId, cwd) {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) return;

    // Update this terminal's section in the file tree
    if (tab.fileTree) {
      tab.fileTree.setTerminalRoot(termId, cwd);
    }

    // Update header path/branch only for the active terminal
    if (
      tab.terminalPanel?.activeTerminal &&
      tab.terminalPanel.activeTerminal.terminal.id === termId
    ) {
      tab.cwd = cwd;
      if (tab.pathTextEl) tab.pathTextEl.textContent = cwd;
      if (tab.branchBadgeEl) {
        const branch = await window.api.git.branch(cwd);
        tab.branchBadgeEl.textContent = branch ? ` ${branch}` : '';
      }
    }
  }

  // Called from keyboard shortcut handler
  splitHorizontal() {
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) tab.terminalPanel.splitActive('horizontal');
  }

  splitVertical() {
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) tab.terminalPanel.splitActive('vertical');
  }
}
