import { bus, subscribeBus, unsubscribeBus } from '../utils/events.js';
import { ConfigManager } from './config-manager.js';
import { extractFolderName } from '../utils/file-tree-helpers.js';
import {
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
  renderWorkspace as doRenderWorkspace, reattachLayout,
  serialize as doSerialize, restoreConfig as doRestoreConfig,
  capturePanelWidths, disposeAllTabs,
} from '../utils/workspace-layout.js';
import {
  createTab as doCreateTab, closeTab as doCloseTab,
  switchTo as doSwitchTo, findTabForTerminal,
  onTerminalCwdChanged,
} from '../utils/tab-lifecycle.js';
import { _el } from '../utils/dom.js';

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

    // Injected API methods for workspace-layout utils
    this._api = { gitBranch: window.api.git.branch };

    this.init();
  }

  // ── View store accessor — maps dynamic viewKey/containerKey to instance properties ──

  /** @returns {import('../utils/sidebar-manager.js').SideViewStore} */
  _viewStore() {
    return {
      getView: (key) => this[key],
      setView: (key, val) => { this[key] = val; },
      getContainer: (key) => this[key],
      setContainer: (key, val) => { this[key] = val; },
    };
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

    this._busListeners = this._setupBusListeners();
  }

  /** Register bus event listeners. Returns the subscription handle for cleanup. */
  _setupBusListeners() {
    return subscribeBus([
      /** @listens terminal:cwdChanged {{ id: string, cwd: string }} */
      ['terminal:cwdChanged', ({ id, cwd }) => {
        this._onTerminalCwdChanged(id, cwd);
        this.configManager.scheduleAutoSave();
      }],
      /** @listens terminal:created {{ id: string, cwd: string }} */
      ['terminal:created', ({ id, cwd }) => {
        const tab = this._findTabForTerminal(id) || this.tabs.get(this.activeTabId);
        if (tab?.fileTree) tab.fileTree.setTerminalRoot(id, cwd);
        this.configManager.scheduleAutoSave();
      }],
      /** @listens terminal:removed {{ id: string }} */
      ['terminal:removed', ({ id }) => {
        for (const [, tab] of this.tabs) {
          if (tab.fileTree) tab.fileTree.removeTerminal(id);
        }
        this.configManager.scheduleAutoSave();
      }],
      /** @listens layout:changed {undefined} */
      ['layout:changed', () => this.configManager.scheduleAutoSave()],
      /** @listens workspace:openFromFolder {{ cwd: string }} */
      ['workspace:openFromFolder', ({ cwd }) => {
        const folderName = extractFolderName(cwd);
        this.createTab(folderName, cwd);
      }],
    ]);
  }

  // Find which tab owns a terminal
  _findTabForTerminal(termId) { return findTabForTerminal(this.tabs, termId)?.tab ?? null; }

  _activeTab() {
    return this.tabs.get(this.activeTabId);
  }

  renderActivityBar() {
    renderActivityBar({
      sidebarMode: this.sidebarMode,
      setSidebarMode: (mode) => this.setSidebarMode(mode),
      onOpenSettings: this.onOpenSettings,
    });
  }

  setSidebarMode(mode) {
    if (mode === this.sidebarMode) return;

    detachSidebarView({
      getActiveTab: () => this._activeTab(),
      capturePanelWidths,
      viewStore: this._viewStore(),
    }, this.sidebarMode);
    this.sidebarMode = mode;

    if (mode !== 'work') {
      activateSideView({
        workspaceContainer: this.workspaceContainer,
        viewStore: this._viewStore(),
      }, mode, {
        boardCtorArgs: [this],
        flowCtorArgs: [this],
      });
    } else {
      const tab = this._activeTab();
      if (tab?.layoutElement) reattachLayout({ workspaceContainer: this.workspaceContainer }, tab);
      else if (tab) this.renderWorkspace(tab);
    }

    this.renderActivityBar();
  }

  switchToBoard() { this.setSidebarMode('board'); }

  _capturePanelWidths(tab) { capturePanelWidths(tab); }

  async renderWorkspace(tab) {
    return doRenderWorkspace({
      workspaceContainer: this.workspaceContainer,
      getActiveTabId: () => this.activeTabId,
      getActiveTab: () => this._activeTab(),
      scheduleAutoSave: () => this.configManager.scheduleAutoSave(),
    }, tab, this._api);
  }

  serialize() {
    return doSerialize({
      tabs: this.tabs,
      activeTabId: this.activeTabId,
    });
  }

  async restoreConfig(config) {
    return doRestoreConfig({
      tabs: this.tabs,
      setActiveTabId: (id) => { this.activeTabId = id; },
      defaultCwd: this.defaultCwd,
      renderTabBar: () => this.renderTabBar(),
      switchTo: (id) => this.switchTo(id),
      configManager: this.configManager,
      viewStore: this._viewStore(),
    }, config);
  }

  autoSave() { return this.configManager.autoSave(); }

  createTab(name = null, cwd = null) {
    return doCreateTab({
      tabs: this.tabs,
      defaultCwd: this.defaultCwd,
      activeColorFilter: this.activeColorFilter,
      renderTabBar: () => this.renderTabBar(),
      configManager: this.configManager,
    }, (id) => this.switchTo(id), name, cwd);
  }

  closeTab(id) {
    return doCloseTab({
      tabs: this.tabs,
      activeTabId: this.activeTabId,
      renderTabBar: () => this.renderTabBar(),
      configManager: this.configManager,
    }, () => this.createTab(), (tabId) => this.switchTo(tabId), id);
  }

  switchTo(id) {
    return doSwitchTo({
      tabs: this.tabs,
      getActiveTabId: () => this.activeTabId,
      setActiveTabId: (newId) => { this.activeTabId = newId; },
      getSidebarMode: () => this.sidebarMode,
      setSidebarMode: (mode) => { this.sidebarMode = mode; },
      workspaceContainer: this.workspaceContainer,
      renderTabBar: () => this.renderTabBar(),
      renderActivityBar: () => this.renderActivityBar(),
      renderWorkspace: (tab) => this.renderWorkspace(tab),
      detachSidebarView: (mode) => detachSidebarView({
        getActiveTab: () => this._activeTab(),
        capturePanelWidths,
        viewStore: this._viewStore(),
      }, mode),
    }, id);
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

    /** @type {import('../utils/tab-renderer.js').TabElementDeps} */
    const tabElementDeps = {
      activeTabId: this.activeTabId,
      tabs: this.tabs,
      switchTo: (id) => this.switchTo(id),
      closeTab: (id) => this.closeTab(id),
      renameTab: (id, nameEl) => this.renameTab(id, nameEl),
      setTabColorGroup: (id, cg) => this.setTabColorGroup(id, cg),
      toggleNoShortcut: (id) => this.toggleNoShortcut(id),
      dragDeps: {
        getTabElements: () => this._tabElements,
        reorderTab: (fromId, toId, before) => this.reorderTab(fromId, toId, before),
      },
    };

    for (const [id, tab] of this.tabs) {
      if (!this._isTabVisible(tab)) continue;
      const tabEl = buildTabElement(tabElementDeps, id, tab);
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

  _onTerminalCwdChanged(termId, cwd) { onTerminalCwdChanged(this.tabs, this.activeTabId, termId, cwd, { gitBranch: window.api.git.branch }); }

  _disposeSideView(mode) { disposeSideView(this._viewStore(), mode); }

  _disposeAllSideViews() { disposeAllSideViews(this._viewStore()); }

  _disposeAllTabs() {
    disposeAllTabs({ tabs: this.tabs, setActiveTabId: (id) => { this.activeTabId = id; } });
  }

  dispose() {
    unsubscribeBus(this._busListeners);
    this._busListeners = [];
    disposeAllSideViews(this._viewStore());
    disposeAllTabs({ tabs: this.tabs, setActiveTabId: (id) => { this.activeTabId = id; } });
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
