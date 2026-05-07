import { registerComponent, getComponent } from '../utils/component-registry.js';
import { ComponentBase } from '../utils/component-base.js';
import { moveFlowInOrder } from '../utils/flow-view-subsystem.js';
import {
  addCategory, renameCategoryInline, deleteCategory,
} from '../utils/flow-view-categories.js';
import {
  renderFlowViewShell, buildGroupParams, buildFlowCard,
  renderFlowList, handleOpenModal, deleteFlow,
} from '../utils/flow-view-rendering.js';
import flowApi from '../services/flow-api.js';


export class FlowView extends ComponentBase {
  constructor(container, tabManager) {
    super(container);
    this.tabManager = tabManager;
    this._initState();
    this._bindEvents();
    this.render();
    this._initRunning();
  }

  _initState() {
    this.flows = [];
    this.catData = { categories: [], order: {} };
    const FlowCardTerminalManager = getComponent('FlowCardTerminalManager');
    this._termManager = new FlowCardTerminalManager();
    this._expandedCards = new Set();
    this._collapsedCategories = new Set();
    this._runningMap = {};
    this._drag = { flowId: null, catId: null };
  }

  _bindEvents() {
    this._track(flowApi.onRunStarted(({ flowId, ptyId }) => {
      this._runningMap[flowId] = ptyId;
      this._expandedCards.add(flowId);
      this.refresh();
    }));
    this._track(flowApi.onRunComplete(({ flowId }) => {
      this._termManager.disposeLiveTerminal(flowId);
      delete this._runningMap[flowId];
      this.refresh();
    }));
  }

  async _initRunning() {
    this._runningMap = await flowApi.getRunning();
    for (const flowId of Object.keys(this._runningMap)) this._expandedCards.add(flowId);
    await this.refresh();
  }

  async refresh() {
    if (this.disposed) return;
    this.flows = await flowApi.list();
    this.catData = await flowApi.getCategories();
    this._renderList();
  }

  async _persistCategories() { await flowApi.saveCategories(this.catData); }

  _moveFlowToCategory(flowId, targetCatId, insertIndex = -1) {
    moveFlowInOrder(this.catData.order, flowId, targetCatId, insertIndex);
    this._persistCategories();
  }

  render() {
    const { listEl } = renderFlowViewShell(this.container, {
      onAddCategory: () => this._addCategory(),
      onAddFlow: () => this._openModal(),
    });
    this.listEl = listEl;
  }

  _buildGroupParams(cat, flows, isUncat = false) {
    return buildGroupParams({
      cat, flows, isUncat,
      collapsedCategories: this._collapsedCategories,
      createCard: (flow, catId) => this._createCard(flow, catId),
      onToggleCollapse: (catId) => this._toggleCollapse(catId),
      onRenameCategory: (catId, nameEl) => this._renameCategoryInline(catId, nameEl),
      onDeleteCategory: (catId) => this._deleteCategory(catId),
      onDropFlow: (flowId, catId, insertIndex) => { this._moveFlowToCategory(flowId, catId, insertIndex); this._renderList(); },
      dragState: {
        getDragFlowId: () => this._drag.flowId,
        clearDrag: () => { this._drag.flowId = null; this._drag.catId = null; },
      },
    });
  }

  _renderList() {
    renderFlowList({
      listEl: this.listEl, flows: this.flows, catData: this.catData,
      termManager: this._termManager, runningMap: this._runningMap,
      buildParams: (cat, flows, isUncat) => this._buildGroupParams(cat, flows, isUncat),
      createCard: (flow, catId) => this._createCard(flow, catId),
    });
  }

  _toggleCollapse(catId) {
    if (this._collapsedCategories.has(catId)) this._collapsedCategories.delete(catId);
    else this._collapsedCategories.add(catId);
    this._renderList();
  }

  _createCard(flow, catId) {
    return buildFlowCard({
      runningMap: this._runningMap, expandedCards: this._expandedCards,
      drag: this._drag, termManager: this._termManager,
      onRenderList: () => this._renderList(),
      onRun: (fId) => flowApi.runNow(fId),
      onToggle: (fId) => flowApi.toggle(fId),
      onRefresh: () => this.refresh(),
      onOpenModal: (f) => this._openModal(f),
      onDeleteFlow: (id) => this._deleteFlow(id),
    }, flow, catId);
  }

  async _deleteFlow(flowId) {
    await deleteFlow({
      termManager: this._termManager, catDataOrder: this.catData.order,
      persistCategories: () => this._persistCategories(), refresh: () => this.refresh(),
    }, flowId, flowApi);
  }

  _addCategory() { return addCategory(this.catData, () => this._persistCategories(), () => this._renderList()); }
  _renameCategoryInline(catId, nameEl) { renameCategoryInline(this.catData, catId, nameEl, () => this._persistCategories(), () => this._renderList()); }
  _deleteCategory(catId) { return deleteCategory(this.catData, catId, () => this._persistCategories(), () => this._renderList()); }

  async _openModal(existing = null) {
    await handleOpenModal(
      { existing, catData: this.catData, moveFlowToCategory: (fId, cId) => this._moveFlowToCategory(fId, cId), persistCategories: () => this._persistCategories(), refresh: () => this.refresh() },
      () => getComponent('openFlowModal'), flowApi,
    );
  }

  dispose() { super.dispose(); this._termManager.disposeAll(); }
}

registerComponent('FlowView', FlowView);
