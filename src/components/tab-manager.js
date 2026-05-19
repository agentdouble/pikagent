import {
  initTabManager, setupBusListeners, getComponent,
  renderActivityBar as doRenderActivityBar,
  setSidebarMode as doSetSidebarMode,
  renderWorkspace as doRenderWorkspace,
  buildSwitchToDeps,
  disposeSideView, disposeAllSideViews, disposeAllTabs,
  bindTabOps,
  reorderTab as doReorderTab,
  renameTab as doRenameTab,
  nextTab as doNextTab, prevTab as doPrevTab,
  goToColorGroup as doGoToColorGroup, focusDirection as doFocusDirection,
  setTabColorGroup as doSetTabColorGroup,
  toggleNoShortcut as doToggleNoShortcut,
} from '../utils/tab-manager-utils.js';
import {
  serialize as doSerialize, restoreConfig as doRestoreConfig,
} from '../utils/workspace-ops.js';
import {
  isTabVisible, setColorFilter as doSetColorFilter,
  toggleExcludeColor as doToggleExcludeColor,
  ensureVisibleTabActive as doEnsureVisibleTabActive,
} from '../utils/tab-color-filter.js';
import { switchTo as doSwitchTo } from '../utils/tab-lifecycle.js';
import { buildPrApi, buildWorktreeApi, buildViewStore } from '../facades/tab-manager-api.js';
import { tabViewFacade } from '../facades/tab-facade.js';

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
    this.configManager = new (getComponent('ConfigSettingsPanel'))(this);
    this.boardView = this._boardContainerEl = null;
    this.flowView = this._flowContainerEl = null;
    this.usageView = this._usageContainerEl = null;
    this.skillsView = this._skillsContainerEl = null;
    this.sidebarMode = 'work';
    this.activeColorFilter = null;
    this.excludedColors = new Set();
    this._tabOps = bindTabOps(this);
  }

  _initApi() { this._api = { gitBranch: tabViewFacade.gitBranch }; }
  _prApi() { return buildPrApi(); }
  _worktreeApi() { return buildWorktreeApi(); }
  _viewStore() { return buildViewStore(this); }
  _activeTab() { return this.tabs.get(this.activeTabId); }

  /** Shared deps object used by tab-manager-sidebar helpers (issue #616). */
  get _deps() {
    return {
      tabManager: this,
      tabs: this.tabs,
      activeTabId: this.activeTabId,
      getActiveTabId: () => this.activeTabId,
      setActiveTabId: (id) => { this.activeTabId = id; },
      sidebarMode: this.sidebarMode,
      getSidebarMode: () => this.sidebarMode,
      setSidebarMode: (mode) => { this.sidebarMode = mode; },
      workspaceContainer: this.workspaceContainer,
      onOpenSettings: this.onOpenSettings,
      configManager: this.configManager,
      scheduleAutoSave: () => this.configManager.scheduleAutoSave(),
      viewStore: this._viewStore(),
      getActiveTab: () => this._activeTab(),
      renderTabBar: () => this.renderTabBar(),
      renderActivityBar: () => this.renderActivityBar(),
      renderWorkspace: (tab) => this.renderWorkspace(tab),
    };
  }

  async init() {
    this.defaultCwd = await initTabManager({
      configManager: this.configManager,
      renderActivityBar: () => this.renderActivityBar(),
      restoreConfig: (config) => this.restoreConfig(config),
      createTab: (name) => this.createTab(name),
      setDefaultCwd: (cwd) => { this.defaultCwd = cwd; },
      api: { homedir: tabViewFacade.homedir, getDefault: tabViewFacade.getDefault, loadDefault: tabViewFacade.loadDefault },
    });
    this._busListeners = setupBusListeners({
      tabs: this.tabs,
      getActiveTabId: () => this.activeTabId,
      configManager: this.configManager,
      createTab: (name, cwd) => this.createTab(name, cwd),
      renderTabBar: () => this.renderTabBar(),
      api: { gitBranch: tabViewFacade.gitBranch, worktree: this._worktreeApi(), pr: this._prApi() },
    });
  }

  // --- Sidebar & Workspace (delegated) ---

  renderActivityBar() { doRenderActivityBar(this._deps); }
  setSidebarMode(mode) { doSetSidebarMode(this._deps, mode); }
  switchToBoard() { this.setSidebarMode('board'); }
  async renderWorkspace(tab) { return doRenderWorkspace(this._deps, tab, this._api); }

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

  createTab(name = null, cwd = null) { return this._tabOps.createTab((id) => this.switchTo(id), name, cwd); }
  closeTab(id) { return this._tabOps.closeTab(() => this.createTab(), (tabId) => this.switchTo(tabId), id); }

  switchTo(id) { return doSwitchTo(buildSwitchToDeps(this._deps), id); }

  renderTabBar() { this._tabElements = this._tabOps.renderTabBar(); }
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

  _disposeSideView(mode) { disposeSideView(this._deps, mode); }
  _disposeAllTabs() { disposeAllTabs(this._deps); }

  dispose() {
    for (const unsub of this._busListeners) unsub();
    this._busListeners = [];
    disposeAllSideViews(this._deps);
    disposeAllTabs(this._deps);
  }
}
