import {
  initTabManager, setupBusListeners,
  unsubscribeBus, getComponent,
} from '../utils/tab-manager-init.js';
import {
  renderWorkspace as doRenderWorkspace, reattachLayout,
  capturePanelWidths, disposeAllTabs,
  serialize as doSerialize, restoreConfig as doRestoreConfig,
  renderActivityBar, detachSidebarView, changeSidebarMode,
  disposeSideView, disposeAllSideViews,
} from '../utils/workspace-facade.js';
import {
  inlineRenameTab,
  renderTabBar as doRenderTabBar,
  isTabVisible,
  createTab as doCreateTab, closeTab as doCloseTab,
  switchTo as doSwitchTo,
  reorderEntries, findCycleTarget, findColorGroupTarget,
} from '../utils/tab-facade.js';

export class TabManager {
  constructor(tabBar, workspaceContainer) {
    this.tabBar = tabBar;
    this.workspaceContainer = workspaceContainer;
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

    // Injected API methods for workspace-layout utils
    this._api = { gitBranch: window.api.git.branch };

    this.init();
  }

  /**
   * Adapter exposing the git + shell surface needed by the open-PR flow.
   * @returns {import('../utils/open-pr-flow.js').OpenPrApi}
   */
  _prApi() {
    return {
      branch:       (cwd) => window.api.git.branch(cwd),
      remoteUrl:    (cwd) => window.api.git.remoteUrl(cwd),
      pushBranch:   ({ cwd, branch }) => window.api.git.pushBranch(cwd, branch),
      ghAvailable:  () => window.api.git.ghAvailable(),
      ghPrCreate:   ({ cwd, baseBranch }) => window.api.git.ghPrCreate(cwd, baseBranch),
      openExternal: (url) => window.api.shell.openExternal(url),
    };
  }

  /**
   * Adapter exposing the git-worktree IPC surface as an object-style API,
   * matching {@link import('../utils/worktree-flow.js').GitWorktreeApi}.
   * @returns {import('../utils/worktree-flow.js').GitWorktreeApi}
   */
  _worktreeApi() {
    return {
      isRepo:       (cwd) => window.api.git.isRepo(cwd),
      branch:       (cwd) => window.api.git.branch(cwd),
      listBranches: (cwd) => window.api.git.listBranches(cwd),
      worktreeList: (cwd) => window.api.git.worktreeList(cwd),
      worktreeAdd:  ({ cwd, branch, targetPath, createBranch, baseBranch }) =>
        window.api.git.worktreeAdd(cwd, branch, targetPath, createBranch, baseBranch),
      worktreeRemove: ({ cwd, worktreePath, force }) =>
        window.api.git.worktreeRemove(cwd, worktreePath, force),
    };
  }

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
    this.defaultCwd = await initTabManager({
      configManager: this.configManager,
      renderActivityBar: () => this.renderActivityBar(),
      restoreConfig: (config) => this.restoreConfig(config),
      createTab: (name) => this.createTab(name),
      setDefaultCwd: (cwd) => { this.defaultCwd = cwd; },
      api: { homedir: window.api.fs.homedir, getDefault: window.api.config.getDefault, loadDefault: window.api.config.loadDefault },
    });

    this._busListeners = setupBusListeners({
      tabs: this.tabs,
      getActiveTabId: () => this.activeTabId,
      configManager: this.configManager,
      createTab: (name, cwd) => this.createTab(name, cwd),
      renderTabBar: () => this.renderTabBar(),
      api: {
        gitBranch: window.api.git.branch,
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
      worktreeApi: this._worktreeApi(),
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

  isActiveNoShortcut() { return this._activeTab()?.noShortcut ?? false; }
  splitHorizontal() { this._activeTab()?.terminalPanel?.splitActive('horizontal'); }
  splitVertical() { this._activeTab()?.terminalPanel?.splitActive('vertical'); }

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
