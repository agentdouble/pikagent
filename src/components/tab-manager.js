import {
  initTabManager, setupBusListeners,
  getComponent,
} from '../utils/tab-manager-init.js';
import {
  serialize as doSerialize, restoreConfig as doRestoreConfig,
} from '../utils/workspace-ops.js';
import {
  isTabVisible,
  switchTo as doSwitchTo,
  setColorFilter as doSetColorFilter,
  toggleExcludeColor as doToggleExcludeColor,
  ensureVisibleTabActive as doEnsureVisibleTabActive,
  nextTab as doNextTab, prevTab as doPrevTab,
  goToColorGroup as doGoToColorGroup, focusDirection as doFocusDirection,
  setTabColorGroup as doSetTabColorGroup,
  toggleNoShortcut as doToggleNoShortcut,
  buildPrApi, buildWorktreeApi, buildViewStore,
} from '../utils/tab-facade.js';
import {
  renderActivityBar as doRenderActivityBar,
  setSidebarMode as doSetSidebarMode,
  renderWorkspace as doRenderWorkspace,
  buildSwitchToDeps,
  disposeSideView, disposeAllSideViews, disposeAllTabs,
} from '../utils/tab-manager-sidebar.js';
import {
  renderTabBar as doRenderTabBar,
  createTab as doCreateTab,
  closeTab as doCloseTab,
  reorderTab as doReorderTab,
  renameTab as doRenameTab,
} from '../utils/tab-manager-tab-ops.js';
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
    this.activeTabId = this.defaultCwd = this.onOpenSettings = null;
    this.configManager = new (getComponent('ConfigManager'))(this);
    this.boardView = this._boardContainerEl = null;
    this.flowView = this._flowContainerEl = null;
    this.usageView = this._usageContainerEl = null;
    this.skillsView = this._skillsContainerEl = null;
    this.sidebarMode = 'work';
    this.activeColorFilter = null;
    this.excludedColors = new Set();
  }

  _initApi() { this._api = { gitBranch: gitApi.branch }; }
  _prApi() { return buildPrApi(); }
  _worktreeApi() { return buildWorktreeApi(); }
  _viewStore() { return buildViewStore(this); }
  _activeTab() { return this.tabs.get(this.activeTabId); }

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
      api: { gitBranch: gitApi.branch, worktree: this._worktreeApi(), pr: this._prApi() },
    });
  }

  // --- Sidebar & Workspace (delegated) ---

  renderActivityBar() { doRenderActivityBar(this); }
  setSidebarMode(mode) { doSetSidebarMode(this, mode); }
  switchToBoard() { this.setSidebarMode('board'); }
  async renderWorkspace(tab) { return doRenderWorkspace(this, tab, this._api); }

  serialize() { return doSerialize({ tabs: this.tabs, activeTabId: this.activeTabId }); }

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

  // --- Tab lifecycle (delegated) ---

  createTab(name = null, cwd = null) { return doCreateTab(this, (id) => this.switchTo(id), name, cwd); }
  closeTab(id) { return doCloseTab(this, () => this.createTab(), (tabId) => this.switchTo(tabId), id); }

  switchTo(id) { return doSwitchTo(buildSwitchToDeps(this), id); }

  renderTabBar() { this._tabElements = doRenderTabBar(this); }
  reorderTab(fromId, toId, before) { doReorderTab(this, fromId, toId, before); }
  renameTab(id, nameEl) { doRenameTab(this, id)(nameEl); }

  // --- Color filters ---

  setColorFilter(cg) { doSetColorFilter(this, cg, () => this.renderTabBar(), () => this._ensureVisibleTabActive()); }
  toggleExcludeColor(cg) { doToggleExcludeColor(this, cg, () => this.renderTabBar(), () => this._ensureVisibleTabActive()); }
  _isTabVisible(tab) { return isTabVisible(tab, this.activeColorFilter, this.excludedColors); }
  _ensureVisibleTabActive() { doEnsureVisibleTabActive(this.tabs, () => this._activeTab(), this.activeColorFilter, this.excludedColors, (id) => this.switchTo(id)); }

  setTabColorGroup(id, cg) { doSetTabColorGroup(this.tabs, id, cg, () => this.renderTabBar(), this.configManager); }
  toggleNoShortcut(id) { doToggleNoShortcut(this.tabs, id, () => this.renderTabBar(), this.configManager); }
  goToColorGroup(cg) { doGoToColorGroup(this.tabs, this.activeTabId, cg, (id) => this.switchTo(id)); }

  // --- Navigation ---

  isActiveNoShortcut() { return this._activeTab()?.noShortcut ?? false; }
  splitHorizontal() { this._activeTab()?.terminalPanel?.splitActive('horizontal'); }
  splitVertical() { this._activeTab()?.terminalPanel?.splitActive('vertical'); }
  focusDirection(dir) { doFocusDirection(dir, this.sidebarMode, this.boardView, () => this._activeTab()); }
  nextTab() { doNextTab(this.tabs, this.activeTabId, (id) => this.switchTo(id)); }
  prevTab() { doPrevTab(this.tabs, this.activeTabId, (id) => this.switchTo(id)); }

  // --- Dispose ---

  _disposeSideView(mode) { disposeSideView(this, mode); }
  _disposeAllTabs() { disposeAllTabs(this); }

  dispose() {
    for (const unsub of this._busListeners) unsub();
    this._busListeners = [];
    disposeAllSideViews(this);
    disposeAllTabs(this);
  }
}
