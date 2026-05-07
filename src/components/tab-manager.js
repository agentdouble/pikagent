import {
  initTabManager, setupBusListeners,
  getComponent,
} from '../utils/tab-manager-init.js';
import {
  renderWorkspace as doRenderWorkspace, reattachLayout,
  capturePanelWidths, disposeAllTabs,
  serialize as doSerialize, restoreConfig as doRestoreConfig,
} from '../utils/workspace-ops.js';
import {
  renderActivityBar, detachSidebarView, changeSidebarMode,
  disposeSideView, disposeAllSideViews,
} from '../utils/sidebar-manager.js';
import {
  inlineRenameTab,
  renderTabBar as doRenderTabBar,
  isTabVisible,
  createTab as doCreateTab, closeTab as doCloseTab,
  switchTo as doSwitchTo,
  reorderEntries,
  setColorFilter as doSetColorFilter,
  toggleExcludeColor as doToggleExcludeColor,
  ensureVisibleTabActive as doEnsureVisibleTabActive,
  nextTab as doNextTab, prevTab as doPrevTab,
  goToColorGroup as doGoToColorGroup, focusDirection as doFocusDirection,
  setTabColorGroup as doSetTabColorGroup,
  toggleNoShortcut as doToggleNoShortcut,
  buildPrApi, buildWorktreeApi, buildViewStore,
} from '../utils/tab-facade.js';
import { gitApi, fsApi, configApi } from '../utils/tab-services.js';

export class TabManager {
  constructor(tabBar, workspaceContainer) {
    this.tabBar = tabBar;
    this.workspaceContainer = workspaceContainer;
    this._initState();
    this._initApi();
    this.init();
  }

  _initState() {
    this.tabs = new Map();
    this.activeTabId = null;
    this.defaultCwd = null;
    this.onOpenSettings = null;
    const ConfigManager = getComponent('ConfigManager');
    this.configManager = new ConfigManager(this);
    this.boardView = null;
    this._boardContainerEl = null;
    this.flowView = null;
    this._flowContainerEl = null;
    this.usageView = null;
    this._usageContainerEl = null;
    this.skillsView = null;
    this._skillsContainerEl = null;
    this.sidebarMode = 'work';
    this.activeColorFilter = null; // null = show all, or a COLOR_GROUPS id
    this.excludedColors = new Set(); // COLOR_GROUPS ids to hide
  }

  _initApi() {
    // Injected API methods for workspace-layout utils
    this._api = { gitBranch: gitApi.branch };
  }

  _prApi() { return buildPrApi(); }
  _worktreeApi() { return buildWorktreeApi(); }
  _viewStore() { return buildViewStore(this); }

  async init() {
    this.defaultCwd = await initTabManager({
      configManager: this.configManager,
      renderActivityBar: () => this.renderActivityBar(),
      restoreConfig: (config) => this.restoreConfig(config),
      createTab: (name) => this.createTab(name),
      setDefaultCwd: (cwd) => { this.defaultCwd = cwd; },
      api: { homedir: fsApi.homedir, getDefault: configApi.getDefault, loadDefault: configApi.loadDefault },
    });

    this._busListeners = setupBusListeners({
      tabs: this.tabs,
      getActiveTabId: () => this.activeTabId,
      configManager: this.configManager,
      createTab: (name, cwd) => this.createTab(name, cwd),
      renderTabBar: () => this.renderTabBar(),
      api: {
        gitBranch: gitApi.branch,
        worktree: this._worktreeApi(),
        pr: this._prApi(),
      },
    });
  }

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

    changeSidebarMode({
      getActiveTab: () => this._activeTab(),
      capturePanelWidths,
      viewStore: this._viewStore(),
      workspaceContainer: this.workspaceContainer,
      reattachLayout,
      renderWorkspace: (tab) => this.renderWorkspace(tab),
      tabManager: this,
      resolveComponent: getComponent,
    }, this.sidebarMode, mode);
    this.sidebarMode = mode;

    this.renderActivityBar();
  }

  switchToBoard() { this.setSidebarMode('board'); }

  async renderWorkspace(tab) {
    return doRenderWorkspace({
      workspaceContainer: this.workspaceContainer,
      getActiveTabId: () => this.activeTabId,
      getActiveTab: () => this._activeTab(),
      scheduleAutoSave: () => this.configManager.scheduleAutoSave(),
    }, tab, this._api, {
      FileTree: getComponent('FileTree'),
      FileViewer: getComponent('FileViewer'),
      TerminalPanel: getComponent('TerminalPanel'),
      WebviewManager: getComponent('WebviewManager'),
      GitChangesView: getComponent('GitChangesView'),
    });
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
    doSetColorFilter(this, colorGroupId, () => this.renderTabBar(), () => this._ensureVisibleTabActive());
  }

  toggleExcludeColor(colorGroupId) {
    doToggleExcludeColor(this, colorGroupId, () => this.renderTabBar(), () => this._ensureVisibleTabActive());
  }

  _isTabVisible(tab) {
    return isTabVisible(tab, this.activeColorFilter, this.excludedColors);
  }

  _ensureVisibleTabActive() {
    doEnsureVisibleTabActive(this.tabs, () => this._activeTab(), this.activeColorFilter, this.excludedColors, (id) => this.switchTo(id));
  }

  renderTabBar() {
    this._tabElements = doRenderTabBar({
      tabBar: this.tabBar,
      tabs: this.tabs,
      activeTabId: this.activeTabId,
      activeColorFilter: this.activeColorFilter,
      excludedColors: this.excludedColors,
      switchTo: (id) => this.switchTo(id),
      closeTab: (id) => this.closeTab(id),
      renameTab: (id, nameEl) => this.renameTab(id, nameEl),
      setTabColorGroup: (id, cg) => this.setTabColorGroup(id, cg),
      toggleNoShortcut: (id) => this.toggleNoShortcut(id),
      setColorFilter: (id) => this.setColorFilter(id),
      toggleExcludeColor: (id) => this.toggleExcludeColor(id),
      clearColorFilters: () => { this.activeColorFilter = null; this.excludedColors.clear(); },
      createTab: () => this.createTab(),
      reorderTab: (fromId, toId, before) => this.reorderTab(fromId, toId, before),
      isTabVisible: (tab) => this._isTabVisible(tab),
      renderTabBar: () => this.renderTabBar(),
    });
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

  _disposeSideView(mode) { disposeSideView(this._viewStore(), mode); }
  _disposeAllTabs() {
    disposeAllTabs({ tabs: this.tabs, setActiveTabId: (id) => { this.activeTabId = id; } });
  }

  dispose() {
    for (const unsub of this._busListeners) unsub();
    this._busListeners = [];
    disposeAllSideViews(this._viewStore());
    this._disposeAllTabs();
  }

  setTabColorGroup(id, colorGroupId) {
    doSetTabColorGroup(this.tabs, id, colorGroupId, () => this.renderTabBar(), this.configManager);
  }

  goToColorGroup(colorGroupId) {
    doGoToColorGroup(this.tabs, this.activeTabId, colorGroupId, (id) => this.switchTo(id));
  }

  toggleNoShortcut(id) {
    doToggleNoShortcut(this.tabs, id, () => this.renderTabBar(), this.configManager);
  }

  isActiveNoShortcut() { return this._activeTab()?.noShortcut ?? false; }
  splitHorizontal() { this._activeTab()?.terminalPanel?.splitActive('horizontal'); }
  splitVertical() { this._activeTab()?.terminalPanel?.splitActive('vertical'); }

  focusDirection(direction) {
    doFocusDirection(direction, this.sidebarMode, this.boardView, () => this._activeTab());
  }

  nextTab() {
    doNextTab(this.tabs, this.activeTabId, (id) => this.switchTo(id));
  }

  prevTab() {
    doPrevTab(this.tabs, this.activeTabId, (id) => this.switchTo(id));
  }
}
