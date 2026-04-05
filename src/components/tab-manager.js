import { generateId } from '../utils/id.js';
import { bus, subscribeBus, unsubscribeBus } from '../utils/events.js';
import { ConfigManager } from './config-manager.js';
import { _el, showConfirmDialog } from '../utils/dom.js';
import { extractFolderName } from '../utils/file-tree-helpers.js';
import {
  COLOR_GROUPS, WorkspaceTab,
  reorderEntries, findCycleTarget, findColorGroupTarget,
} from '../utils/tab-manager-helpers.js';
import { isTabVisible, buildColorFilters } from '../utils/tab-color-filter.js';
import { buildTabElement, inlineRenameTab } from '../utils/tab-renderer.js';

// Extracted modules
import {
  renderActivityBar, detachSidebarView, activateSideView,
  disposeSideView, disposeAllSideViews,
} from '../utils/sidebar-manager.js';
import {
  renderWorkspace as doRenderWorkspace, reattachLayout, syncFileTree,
  serialize as doSerialize, restoreConfig as doRestoreConfig,
  capturePanelWidths, disposeTab, disposeAllTabs,
} from '../utils/workspace-layout.js';

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

    // Bus event listeners — single declaration drives both registration and cleanup
    this._busListeners = subscribeBus([
      ['terminal:cwdChanged', ({ id, cwd }) => {
        this._onTerminalCwdChanged(id, cwd);
        this.configManager.scheduleAutoSave();
      }],
      ['terminal:created', ({ id, cwd }) => {
        const tab = this._findTabForTerminal(id) || this.tabs.get(this.activeTabId);
        if (tab?.fileTree) tab.fileTree.setTerminalRoot(id, cwd);
        this.configManager.scheduleAutoSave();
      }],
      ['terminal:removed', ({ id }) => {
        for (const [, tab] of this.tabs) {
          if (tab.fileTree) tab.fileTree.removeTerminal(id);
        }
        this.configManager.scheduleAutoSave();
      }],
      ['layout:changed', () => this.configManager.scheduleAutoSave()],
      ['workspace:openFromFolder', ({ cwd }) => {
        const folderName = extractFolderName(cwd);
        this.createTab(folderName, cwd);
      }],
    ]);
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

  renderActivityBar() { renderActivityBar(this); }

  setSidebarMode(mode) {
    if (mode === this.sidebarMode) return;

    detachSidebarView(this, this.sidebarMode);
    this.sidebarMode = mode;

    if (mode !== 'work') {
      activateSideView(this, mode);
    } else {
      const tab = this._activeTab();
      if (tab?.layoutElement) reattachLayout(this, tab);
      else if (tab) this.renderWorkspace(tab);
    }

    this.renderActivityBar();
  }

  switchToBoard() { this.setSidebarMode('board'); }

  _capturePanelWidths(tab) { capturePanelWidths(tab); }

  async renderWorkspace(tab) { return doRenderWorkspace(this, tab); }

  serialize() { return doSerialize(this); }

  async restoreConfig(config) { return doRestoreConfig(this, config); }

  autoSave() { return this.configManager.autoSave(); }

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

    const ok = await showConfirmDialog(
      _el('p', null, 'Close workspace ', _el('strong', null, tab.name), '?'),
      { confirmLabel: 'Close' },
    );
    if (!ok) return;

    disposeTab(tab);
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
      detachSidebarView(this, this.sidebarMode);
      this.sidebarMode = 'work';
      this.renderActivityBar();

      // If this tab is already active, just re-show its layout
      if (id === this.activeTabId) {
        if (tab.layoutElement) {
          reattachLayout(this, tab);
          syncFileTree(tab);
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
        capturePanelWidths(prev);
        prev.layoutElement.remove();
      }
    }

    this.activeTabId = id;
    this.renderTabBar();

    if (tab.layoutElement) {
      reattachLayout(this, tab);
      syncFileTree(tab);
      bus.emit('workspace:activated');
    } else {
      // First time rendering this tab
      this.renderWorkspace(tab);
    }
  }

  setColorFilter(colorGroupId) {
    this.excludedColors.clear();
    this.activeColorFilter = this.activeColorFilter === colorGroupId ? null : colorGroupId;
    this.renderTabBar();
    this._ensureVisibleTabActive();
  }

  toggleExcludeColor(colorGroupId) {
    this.activeColorFilter = null;
    if (this.excludedColors.has(colorGroupId)) this.excludedColors.delete(colorGroupId);
    else this.excludedColors.add(colorGroupId);
    this.renderTabBar();
    this._ensureVisibleTabActive();
  }

  _isTabVisible(tab) {
    return isTabVisible(tab, this.activeColorFilter, this.excludedColors);
  }

  _ensureVisibleTabActive() {
    const active = this._activeTab();
    if (active && this._isTabVisible(active)) return;
    for (const [id, tab] of this.tabs) {
      if (this._isTabVisible(tab)) { this.switchTo(id); return; }
    }
  }

  renderTabBar() {
    this.tabBar.replaceChildren();

    const filters = buildColorFilters(this.tabs, this.activeColorFilter, this.excludedColors, {
      onClearFilter: () => { this.activeColorFilter = null; this.excludedColors.clear(); this.renderTabBar(); },
      onSetFilter: (id) => this.setColorFilter(id),
      onToggleExclude: (id) => this.toggleExcludeColor(id),
    });
    if (filters) this.tabBar.appendChild(filters);

    this._tabElements = new Map();

    for (const [id, tab] of this.tabs) {
      if (!this._isTabVisible(tab)) continue;
      const tabEl = buildTabElement(this, id, tab);
      this.tabBar.appendChild(tabEl);
      this._tabElements.set(id, tabEl);
    }

    const addBtn = _el('div', 'tab tab-add', '+');
    addBtn.addEventListener('click', () => this.createTab());
    this.tabBar.appendChild(addBtn);
  }

  reorderTab(fromId, toId, before) {
    if (fromId === toId) return;
    this.tabs = new Map(reorderEntries(Array.from(this.tabs.entries()), fromId, toId, before));
    this.renderTabBar();
    this.configManager.scheduleAutoSave();
  }

  renameTab(id, nameEl) {
    const tab = this.tabs.get(id);
    inlineRenameTab(tab, nameEl,
      () => { this.renderTabBar(); this.configManager.scheduleAutoSave(); },
      () => this.renderTabBar(),
    );
  }

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

  _disposeSideView(mode) { disposeSideView(this, mode); }

  _disposeAllSideViews() { disposeAllSideViews(this); }

  _disposeAllTabs() { disposeAllTabs(this); }

  dispose() {
    unsubscribeBus(this._busListeners);
    this._busListeners = [];
    disposeAllSideViews(this);
    disposeAllTabs(this);
  }

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
