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
import {
  DRAG_THRESHOLD, PANEL_MIN_WIDTH, FIT_DELAY_MS,
  ACTIVITY_BUTTONS, COLOR_GROUPS, SIDE_VIEWS, TAB_DISPOSABLES, WorkspaceTab,
  clampPanelWidth, panelArrowState, reorderEntries,
  findCycleTarget, findColorGroupTarget,
} from '../utils/tab-manager-helpers.js';

/**
 * Declarative map for sidebar view rendering — single source of truth for
 * ViewClass, constructor args, and post-reattach behavior per sidebar mode.
 * Lives here (not in helpers) because it references DOM component classes.
 */
const SIDE_VIEW_RENDERERS = {
  board: {
    ViewClass: BoardView,
    ctorArgs: (self) => [self],
    onReattach: (self) => {
      for (const [, card] of self.boardView.cards) {
        try { card.fitAddon.fit(); } catch {}
      }
      self.boardView.resume();
    },
  },
  flow: {
    ViewClass: FlowView,
    ctorArgs: (self) => [self],
    onReattach: (self) => self.flowView.refresh(),
  },
  usage: {
    ViewClass: UsageView,
    ctorArgs: () => [],
    onReattach: (self) => self.usageView.refresh(),
  },
};

export { COLOR_GROUPS };

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
    this.activeColorFilter = null; // null = show all, or a COLOR_GROUPS id
    this.excludedColors = new Set(); // COLOR_GROUPS ids to hide

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
      return;
    }
    const cfg = SIDE_VIEWS[mode];
    if (!cfg) return;
    if (cfg.pauseOnDetach) {
      this[cfg.viewKey]?.pause();
      this[cfg.containerKey]?.remove();
    } else {
      this._disposeSideView(mode);
    }
  }

  setSidebarMode(mode) {
    if (mode === this.sidebarMode) return;

    this._detachSidebarView(this.sidebarMode);
    this.sidebarMode = mode;

    if (SIDE_VIEWS[mode]) {
      this._activateSideView(mode);
    } else {
      const tab = this._activeTab();
      if (tab?.layoutElement) this._reattachLayout(tab);
      else if (tab) this.renderWorkspace(tab);
    }

    this.renderActivityBar();
  }

  switchToBoard() {
    this.setSidebarMode('board');
  }

  // ===== Side view disposal (table-driven) =====

  _disposeSideView(mode) {
    const cfg = SIDE_VIEWS[mode];
    if (!cfg) return;
    if (this[cfg.viewKey]) {
      this[cfg.viewKey].dispose();
      this[cfg.viewKey] = null;
    }
    if (this[cfg.containerKey]) {
      this[cfg.containerKey].remove();
      this[cfg.containerKey] = null;
    }
  }

  _disposeAllSideViews() {
    for (const mode of Object.keys(SIDE_VIEWS)) this._disposeSideView(mode);
  }

  /** Activate a side view by mode using SIDE_VIEW_RENDERERS config. */
  _activateSideView(mode) {
    const sideView = SIDE_VIEWS[mode];
    const renderer = SIDE_VIEW_RENDERERS[mode];
    if (!sideView || !renderer) return;
    const reattached = this._renderSideView(
      sideView.viewKey, sideView.containerKey,
      renderer.ViewClass, ...renderer.ctorArgs(this),
    );
    if (reattached) renderer.onReattach(this);
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
    if (this.activeColorFilter) tab.colorGroup = this.activeColorFilter;
    this.tabs.set(id, tab);
    this.renderTabBar();
    this.switchTo(id);
    this.configManager.scheduleAutoSave();
    return tab;
  }

  async closeTab(id) {
    const tab = this.tabs.get(id);
    if (!tab) return;

    const ok = await new Promise((resolve) => {
      const overlay = _el('div', 'confirm-overlay');
      const box = _el('div', 'confirm-box');
      box.innerHTML = `<p>Close workspace <strong>${tab.name}</strong>?</p>`;
      const btnRow = _el('div', 'confirm-buttons');
      const cancelBtn = _el('button', 'confirm-cancel', 'Cancel');
      const confirmBtn = _el('button', 'confirm-ok', 'Close');
      btnRow.append(cancelBtn, confirmBtn);
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const cleanup = (result) => { overlay.remove(); resolve(result); };
      cancelBtn.addEventListener('click', () => cleanup(false));
      confirmBtn.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
      confirmBtn.focus();
    });
    if (!ok) return;

    this._disposeTab(tab);
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

  setColorFilter(colorGroupId) {
    this.excludedColors.clear();
    this.activeColorFilter = this.activeColorFilter === colorGroupId ? null : colorGroupId;
    this.renderTabBar();
    // If active tab is hidden by filter, switch to first visible tab
    if (this.activeColorFilter) {
      const active = this._activeTab();
      if (!active || active.colorGroup !== this.activeColorFilter) {
        for (const [id, tab] of this.tabs) {
          if (tab.colorGroup === this.activeColorFilter) {
            this.switchTo(id);
            return;
          }
        }
      }
    }
  }

  toggleExcludeColor(colorGroupId) {
    this.activeColorFilter = null;
    if (this.excludedColors.has(colorGroupId)) {
      this.excludedColors.delete(colorGroupId);
    } else {
      this.excludedColors.add(colorGroupId);
    }
    this.renderTabBar();
    // If active tab is now excluded, switch to first visible
    const active = this._activeTab();
    if (active && this.excludedColors.has(active.colorGroup)) {
      for (const [id, tab] of this.tabs) {
        if (!this.excludedColors.has(tab.colorGroup)) {
          this.switchTo(id);
          return;
        }
      }
    }
  }

  _buildColorFilters() {
    const usedColors = new Set();
    for (const [, tab] of this.tabs) {
      if (tab.colorGroup) usedColors.add(tab.colorGroup);
    }
    if (usedColors.size === 0) return null;

    const filterWrap = _el('div', 'tab-color-filters');

    const noFilter = this.activeColorFilter === null && this.excludedColors.size === 0;
    const allBtn = _el('span', `tab-filter-dot tab-filter-all${noFilter ? ' active' : ''}`);
    allBtn.textContent = '\u2217';
    allBtn.addEventListener('click', () => {
      this.activeColorFilter = null;
      this.excludedColors.clear();
      this.renderTabBar();
    });
    filterWrap.appendChild(allBtn);

    for (const cg of COLOR_GROUPS) {
      if (!usedColors.has(cg.id)) continue;
      const isIncluded = this.activeColorFilter === cg.id;
      const isExcluded = this.excludedColors.has(cg.id);
      const cls = `tab-filter-dot${isIncluded ? ' active' : ''}${isExcluded ? ' excluded' : ''}`;
      const dot = _el('span', cls);
      dot.style.background = cg.color;
      dot.title = `${cg.label}${isExcluded ? ' (excluded)' : ''}`;
      dot.addEventListener('click', () => this.setColorFilter(cg.id));
      dot.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.toggleExcludeColor(cg.id);
      });
      filterWrap.appendChild(dot);
    }

    return filterWrap;
  }

  _isTabVisible(tab) {
    if (this.activeColorFilter && tab.colorGroup !== this.activeColorFilter) return false;
    if (this.excludedColors.has(tab.colorGroup)) return false;
    return true;
  }

  _buildTabEl(id, tab) {
    const tabEl = _el('div', 'tab');
    tabEl.dataset.tabId = id;
    if (id === this.activeTabId) tabEl.classList.add('active');
    if (tab.noShortcut) tabEl.classList.add('tab-no-shortcut');

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

    if (this.tabs.size > 1) {
      const closeEl = _el('span', 'tab-close', '\u00d7');
      closeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(id);
      });
      tabEl.appendChild(closeEl);
    }

    tabEl.addEventListener('click', () => this.switchTo(id));
    this.setupTabDrag(tabEl, id);
    this._bindTabContextMenu(tabEl, id, tab, nameEl);

    return tabEl;
  }

  _bindTabContextMenu(tabEl, id, tab, nameEl) {
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
  }

  renderTabBar() {
    this.tabBar.replaceChildren();

    const filters = this._buildColorFilters();
    if (filters) this.tabBar.appendChild(filters);

    this._tabElements = new Map();

    for (const [id, tab] of this.tabs) {
      if (!this._isTabVisible(tab)) continue;
      const tabEl = this._buildTabEl(id, tab);
      this.tabBar.appendChild(tabEl);
      this._tabElements.set(id, tabEl);
    }

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
    this.tabs = new Map(reorderEntries(Array.from(this.tabs.entries()), fromId, toId, before));
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

  _buildLeftPanel() {
    const panel = _el('div', 'panel panel-left');
    const header = _el('div', 'panel-header');
    header.appendChild(_el('span', 'panel-title', 'Explorer'));
    panel.appendChild(header);
    const treeContainer = _el('div', 'file-tree');
    panel.appendChild(treeContainer);
    const handle = _el('div', 'panel-resize-handle');
    this.setupPanelResize(handle, panel, 'left');
    return { panel, handle, treeContainer };
  }

  _buildRightPanel() {
    const panel = _el('div', 'panel panel-right');
    const viewerContainer = _el('div', 'file-viewer');
    panel.appendChild(viewerContainer);
    const handle = _el('div', 'panel-resize-handle');
    this.setupPanelResize(handle, panel, 'right');
    return { panel, handle, viewerContainer };
  }

  _buildCenterPanel(tab, leftPanel, rightPanel) {
    const panel = _el('div', 'panel panel-center');
    const header = _el('div', 'panel-header');

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
    header.appendChild(pathInfo);
    header.appendChild(_el('div', 'term-label', 'Terminal'));
    panel.appendChild(header);

    const termContainer = _el('div', 'terminal-area');
    panel.appendChild(termContainer);

    tab.pathTextEl = pathText;
    tab.branchBadgeEl = branchBadge;

    return { panel, termContainer };
  }

  _restorePanelSizes(panels, leftPanel, rightPanel) {
    if (!panels) return;
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

  async renderWorkspace(tab) {
    this.workspaceContainer.replaceChildren();

    const layout = _el('div', 'workspace-layout');

    const { panel: leftPanel, handle: leftHandle, treeContainer } = this._buildLeftPanel();
    const { panel: rightPanel, handle: rightHandle, viewerContainer } = this._buildRightPanel();
    const { panel: centerPanel, termContainer } = this._buildCenterPanel(tab, leftPanel, rightPanel);

    layout.append(leftPanel, leftHandle, centerPanel, rightHandle, rightPanel);
    this.workspaceContainer.appendChild(layout);

    tab.layoutElement = layout;
    tab.fileTree = new FileTree(treeContainer);
    tab.fileViewer = new FileViewer(viewerContainer, () => tab.id === this.activeTabId);

    if (tab._restoreData?.splitTree) {
      tab.terminalPanel = new TerminalPanel(termContainer, tab.cwd);
      tab.terminalPanel.restoreFromTree(tab._restoreData.splitTree);
      this._restorePanelSizes(tab._restoreData.panels, leftPanel, rightPanel);
      this._syncFileTree(tab);
      if (tab._restoreData.webviewTabs && tab.fileViewer) {
        tab.fileViewer.setWebviewTabs(tab._restoreData.webviewTabs);
      }
      delete tab._restoreData;
    } else {
      tab.terminalPanel = new TerminalPanel(termContainer, tab.cwd);
      const firstTermId = tab.terminalPanel.activeTerminal?.terminal?.id;
      if (firstTermId) tab.fileTree.setTerminalRoot(firstTermId, tab.cwd);
    }

    const branch = await window.api.git.branch(tab.cwd);
    if (branch) tab.branchBadgeEl.textContent = ` ${branch}`;

    bus.emit('workspace:activated');
  }

  togglePanel(panel, side, arrowEl) {
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
        panel.style.width = `${clampPanelWidth(newWidth, side)}px`;
        panel.style.flex = 'none';
        this._activeTab()?.terminalPanel?.fitAll();
      });
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.body.classList.remove('resizing');
      this.configManager.scheduleAutoSave();
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startWidth = panel.getBoundingClientRect().width;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.body.classList.add('resizing');
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

  _disposeTab(tab) {
    for (const key of TAB_DISPOSABLES) if (tab[key]) tab[key].dispose();
    if (tab.layoutElement) tab.layoutElement.remove();
  }

  _disposeAllTabs() {
    for (const [id, tab] of [...this.tabs]) {
      this._disposeTab(tab);
      this.tabs.delete(id);
    }
    this.activeTabId = null;
  }

  dispose() {
    for (const [event, handler] of this._busListeners) {
      bus.off(event, handler);
    }
    this._busListeners = [];
    this._disposeAllSideViews();
    this._disposeAllTabs();
  }

  async restoreConfig(config) {
    if (!config || !config.tabs || config.tabs.length === 0) return;

    this.configManager.isRestoring = true;

    // Reset side views (old terminal IDs will be invalid)
    this._disposeAllSideViews();
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
    const target = findColorGroupTarget(this.tabs, this.activeTabId, colorGroupId);
    if (target) this.switchTo(target);
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

  nextTab() {
    const target = findCycleTarget(this.tabs, this.activeTabId, 1);
    if (target) this.switchTo(target);
  }

  prevTab() {
    const target = findCycleTarget(this.tabs, this.activeTabId, -1);
    if (target) this.switchTo(target);
  }
}
