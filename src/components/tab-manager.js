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
    this._saveTimer = null;
    this._restoringConfig = false;
    this.currentConfigName = null;
    this._configBarEl = null;

    this.init();
  }

  async init() {
    this.defaultCwd = await window.api.fs.homedir();

    // Auto-restore default config on startup
    try {
      const defaultName = await window.api.config.getDefault();
      const defaultConfig = await window.api.config.loadDefault();
      if (defaultConfig && defaultConfig.tabs && defaultConfig.tabs.length > 0) {
        this.currentConfigName = defaultName;
        await this.restoreConfig(defaultConfig);
      } else {
        this.currentConfigName = 'Default';
        this.createTab('Workspace 1');
      }
    } catch (e) {
      console.warn('Failed to restore config:', e);
      this.currentConfigName = 'Default';
      this.createTab('Workspace 1');
    }

    // Listen for terminal exits
    bus.on('terminal:exited', ({ id }) => {
      // The terminal panel handles cleanup
    });

    // Listen for cwd changes from any terminal
    bus.on('terminal:cwdChanged', ({ id, cwd }) => {
      this.onTerminalCwdChanged(id, cwd);
      this.scheduleAutoSave();
    });

    // Listen for new terminals created via split
    bus.on('terminal:created', ({ id, cwd }) => {
      const tab = this.tabs.get(this.activeTabId);
      if (tab && tab.fileTree) {
        tab.fileTree.setTerminalRoot(id, cwd);
      }
      this.scheduleAutoSave();
    });

    // Listen for terminal removals
    bus.on('terminal:removed', ({ id }) => {
      const tab = this.tabs.get(this.activeTabId);
      if (tab && tab.fileTree) {
        tab.fileTree.removeTerminal(id);
      }
      this.scheduleAutoSave();
    });

    // Listen for split resize changes
    bus.on('layout:changed', () => {
      this.scheduleAutoSave();
    });
  }

  scheduleAutoSave() {
    if (this._restoringConfig) return;
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.autoSave();
    }, 500);
  }

  async autoSave() {
    try {
      const data = this.serialize();
      const name = this.currentConfigName || 'Default';
      await window.api.config.save(name, data);
      await window.api.config.setDefault(name);
      this.currentConfigName = name;
      this.updateConfigBar();
    } catch (e) {
      console.warn('Auto-save failed:', e);
    }
  }

  createTab(name = null) {
    const id = generateId('tab');
    const tabName = name || `Workspace ${this.tabs.size + 1}`;
    const tab = new WorkspaceTab(id, tabName, this.defaultCwd || '/');
    this.tabs.set(id, tab);
    this.renderTabBar();
    this.switchTo(id);
    this.scheduleAutoSave();
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
    this.scheduleAutoSave();
  }

  switchTo(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    // Save state of outgoing tab before destroying it
    this.snapshotActiveTab();

    this.activeTabId = id;
    this.renderTabBar();
    this.renderWorkspace(tab);
  }

  snapshotActiveTab() {
    if (!this.activeTabId) return;
    const prev = this.tabs.get(this.activeTabId);
    if (!prev || !prev.terminalPanel) return;

    prev._restoreData = prev._restoreData || {};
    prev._restoreData.splitTree = prev.terminalPanel.serialize();

    // Capture panel widths
    const layout = this.workspaceContainer.querySelector('.workspace-layout');
    if (layout) {
      const left = layout.querySelector('.panel-left');
      const right = layout.querySelector('.panel-right');
      prev._restoreData.panels = {};
      if (left) {
        prev._restoreData.panels.leftWidth = left.getBoundingClientRect().width;
        prev._restoreData.panels.leftCollapsed = left.classList.contains('collapsed');
      }
      if (right) {
        prev._restoreData.panels.rightWidth = right.getBoundingClientRect().width;
        prev._restoreData.panels.rightCollapsed = right.classList.contains('collapsed');
      }
    }
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
      this.scheduleAutoSave();
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

    // Config bar at bottom of left panel
    const configBar = document.createElement('button');
    configBar.className = 'config-bar-btn';
    configBar.innerHTML = `<span class="config-bar-icon">&#9776;</span><span class="config-bar-name">${this.currentConfigName || 'Default'}</span>`;
    configBar.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showConfigMenu(configBar);
    });
    this._configBarEl = configBar;
    leftPanel.appendChild(configBar);

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
    // Refit terminals
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) {
      setTimeout(() => tab.terminalPanel.fitAll(), 200);
    }
    this.scheduleAutoSave();
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
      this.scheduleAutoSave();
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

  serialize() {
    const tabs = [];
    let activeTabIndex = 0;
    let i = 0;

    for (const [id, tab] of this.tabs) {
      if (id === this.activeTabId) activeTabIndex = i;

      const isActive = id === this.activeTabId;
      const tabData = {
        name: tab.name,
        cwd: tab.cwd,
        splitTree: null,
        panels: {},
      };

      if (isActive && tab.terminalPanel) {
        // Active tab: serialize live from DOM
        tabData.splitTree = tab.terminalPanel.serialize();

        const layout = this.workspaceContainer.querySelector('.workspace-layout');
        if (layout) {
          const left = layout.querySelector('.panel-left');
          const right = layout.querySelector('.panel-right');
          if (left) {
            tabData.panels.leftWidth = left.getBoundingClientRect().width;
            tabData.panels.leftCollapsed = left.classList.contains('collapsed');
          }
          if (right) {
            tabData.panels.rightWidth = right.getBoundingClientRect().width;
            tabData.panels.rightCollapsed = right.classList.contains('collapsed');
          }
        }
      } else if (tab._restoreData) {
        // Inactive tab: use snapshotted data
        tabData.splitTree = tab._restoreData.splitTree || null;
        tabData.panels = tab._restoreData.panels || {};
      }

      tabs.push(tabData);
      i++;
    }

    return { tabs, activeTabIndex };
  }

  async restoreConfig(config) {
    if (!config || !config.tabs || config.tabs.length === 0) return;

    this._restoringConfig = true;

    // Dispose all existing tabs
    for (const [id, tab] of this.tabs) {
      if (tab.terminalPanel) tab.terminalPanel.dispose();
    }
    this.tabs.clear();
    this.activeTabId = null;

    // Create tabs from config
    for (const tabData of config.tabs) {
      const id = generateId('tab');
      const tab = new WorkspaceTab(id, tabData.name, tabData.cwd || this.defaultCwd || '/');
      tab._restoreData = tabData; // Stash for renderWorkspace
      this.tabs.set(id, tab);
    }

    this.renderTabBar();

    // Switch to the active tab
    const tabIds = Array.from(this.tabs.keys());
    const activeIdx = Math.min(config.activeTabIndex || 0, tabIds.length - 1);
    this.switchTo(tabIds[activeIdx]);

    this._restoringConfig = false;
  }

  async newConfig(name) {
    if (!name) return;
    // Save current config before switching
    await this.autoSave();

    this.currentConfigName = name;

    // Dispose all existing tabs
    for (const [id, tab] of this.tabs) {
      if (tab.terminalPanel) tab.terminalPanel.dispose();
    }
    this.tabs.clear();
    this.activeTabId = null;

    this.createTab('Workspace 1');
    await window.api.config.setDefault(name);
    await this.autoSave();
    this.updateConfigBar();
  }

  async duplicateConfig(newName) {
    if (!newName) return;
    const data = this.serialize();
    await window.api.config.save(newName, data);
    this.currentConfigName = newName;
    await window.api.config.setDefault(newName);
    this.updateConfigBar();
  }

  async switchConfig(name) {
    if (name === this.currentConfigName) return;
    // Save current before switching
    await this.autoSave();

    const config = await window.api.config.load(name);
    if (config && config.tabs && config.tabs.length > 0) {
      this.currentConfigName = name;
      await window.api.config.setDefault(name);
      await this.restoreConfig(config);
      this.updateConfigBar();
    }
  }

  updateConfigBar() {
    if (this._configBarEl) {
      const label = this._configBarEl.querySelector('.config-bar-name');
      if (label) label.textContent = this.currentConfigName || 'Default';
    }
  }

  async showConfigMenu(anchorEl) {
    const configs = await window.api.config.list();
    const rect = anchorEl.getBoundingClientRect();

    const items = [];

    // List all configs to switch to
    for (const config of configs) {
      const isCurrent = config.name === this.currentConfigName;
      items.push({
        label: `${isCurrent ? '● ' : ''}${config.name}`,
        action: () => this.switchConfig(config.name),
      });
    }

    if (configs.length > 0) {
      items.push({ separator: true });
    }

    // New config
    items.push({
      label: 'New Config...',
      action: () => this.promptConfigName('New Config', (name) => this.newConfig(name)),
    });

    // Duplicate
    items.push({
      label: 'Duplicate Current...',
      action: () => {
        const suggested = `${this.currentConfigName || 'Default'} (copy)`;
        this.promptConfigName(suggested, (name) => this.duplicateConfig(name));
      },
    });

    contextMenu.show(rect.left, rect.top - 4, items);
  }

  promptConfigName(defaultValue, callback) {
    // Small inline prompt overlay
    const overlay = document.createElement('div');
    overlay.className = 'config-prompt-overlay';

    const box = document.createElement('div');
    box.className = 'config-prompt-box';

    const label = document.createElement('label');
    label.className = 'config-prompt-label';
    label.textContent = 'Config name';

    const input = document.createElement('input');
    input.className = 'config-prompt-input';
    input.type = 'text';
    input.value = defaultValue;

    const btns = document.createElement('div');
    btns.className = 'config-prompt-btns';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'config-prompt-cancel';
    cancelBtn.textContent = 'Cancel';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'config-prompt-confirm';
    confirmBtn.textContent = 'Create';

    const close = () => overlay.remove();
    const confirm = () => {
      const name = input.value.trim();
      close();
      if (name) callback(name);
    };

    cancelBtn.addEventListener('click', close);
    confirmBtn.addEventListener('click', confirm);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') close();
    });

    btns.appendChild(cancelBtn);
    btns.appendChild(confirmBtn);
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(btns);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    input.select();
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

  focusDirection(direction) {
    const tab = this.tabs.get(this.activeTabId);
    if (tab && tab.terminalPanel) tab.terminalPanel.focusDirection(direction);
  }

  nextTab() {
    const ids = Array.from(this.tabs.keys());
    if (ids.length < 2) return;
    const idx = ids.indexOf(this.activeTabId);
    const next = ids[(idx + 1) % ids.length];
    this.switchTo(next);
  }

  prevTab() {
    const ids = Array.from(this.tabs.keys());
    if (ids.length < 2) return;
    const idx = ids.indexOf(this.activeTabId);
    const prev = ids[(idx - 1 + ids.length) % ids.length];
    this.switchTo(prev);
  }
}
