import { startInlineRename } from '../utils/form-helpers.js';
import { showPromptDialog } from '../utils/dom-dialogs.js';
import { generateId } from '../utils/id.js';
import { registerComponent, getComponent } from '../utils/component-registry.js';
import {
  UNCATEGORIZED,
  removeFlowFromOrder, moveFlowInOrder, deleteCategoryData,
} from '../utils/flow-view-helpers.js';
import { createFlowCard } from '../utils/flow-card-setup.js';
import { buildFlowLayout, renderFlowList } from '../utils/flow-view-renderer.js';


export class FlowView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.flows = [];
    this.catData = { categories: [], order: {} };
    this.disposed = false;
    const FlowCardTerminalManager = getComponent('FlowCardTerminalManager');
    this._termManager = new FlowCardTerminalManager();
    this._expandedCards = new Set();
    this._collapsedCategories = new Set();
    this._runningMap = {};

    // Drag state (shared mutable object for use with setupCardDrag)
    this._drag = { flowId: null, catId: null };

    this._unsubStarted = window.api.flow.onRunStarted(({ flowId, ptyId }) => {
      this._runningMap[flowId] = ptyId;
      this._expandedCards.add(flowId);
      this.refresh();
    });

    this._unsubComplete = window.api.flow.onRunComplete(({ flowId }) => {
      this._termManager.disposeLiveTerminal(flowId);
      delete this._runningMap[flowId];
      this.refresh();
    });

    this.render();
    this._initRunning();
  }

  async _initRunning() {
    this._runningMap = await window.api.flow.getRunning();
    for (const flowId of Object.keys(this._runningMap)) {
      this._expandedCards.add(flowId);
    }
    await this.refresh();
  }

  async refresh() {
    if (this.disposed) return;
    this.flows = await window.api.flow.list();
    this.catData = await window.api.flow.getCategories();
    this._renderList();
  }

  async _persistCategories() {
    await window.api.flow.saveCategories(this.catData);
  }

  _moveFlowToCategory(flowId, targetCatId, insertIndex = -1) {
    moveFlowInOrder(this.catData.order, flowId, targetCatId, insertIndex);
    this._persistCategories();
  }

  // --- Rendering ---

  render() {
    this.container.replaceChildren();
    const { wrapper, listEl } = buildFlowLayout({
      onAddCategory: () => this._addCategory(),
      onAddFlow: () => this._openModal(),
    });
    this.listEl = listEl;
    this.container.appendChild(wrapper);
  }

  _buildGroupParams(cat, flows, isUncat = false) {
    return {
      cat,
      flows,
      isUncategorized: isUncat,
      collapsedCategories: this._collapsedCategories,
      createCard: (flow, catId) => this._createCard(flow, catId),
      onToggleCollapse: (catId) => this._toggleCollapse(catId),
      onRenameCategory: (catId, nameEl) => this._renameCategoryInline(catId, nameEl),
      onDeleteCategory: (catId) => this._deleteCategory(catId),
      onDropFlow: (flowId, catId, insertIndex) => {
        this._moveFlowToCategory(flowId, catId, insertIndex);
        this._renderList();
      },
      dragState: {
        getDragFlowId: () => this._drag.flowId,
        clearDrag: () => { this._drag.flowId = null; this._drag.catId = null; },
      },
    };
  }

  _renderList() {
    if (!this.listEl) return;

    this._termManager.cleanupStaleLiveTerminals(this._runningMap);
    this._termManager.disposeAllLogTerminals();

    renderFlowList(
      this.listEl, this.flows, this.catData,
      (cat, flows, isUncat) => this._buildGroupParams(cat, flows, isUncat),
      (flow, catId) => this._createCard(flow, catId),
    );
  }

  _toggleCollapse(catId) {
    if (this._collapsedCategories.has(catId)) {
      this._collapsedCategories.delete(catId);
    } else {
      this._collapsedCategories.add(catId);
    }
    this._renderList();
  }

  _createCard(flow, catId) {
    return createFlowCard({
      runningMap: this._runningMap,
      expandedCards: this._expandedCards,
      drag: this._drag,
      termManager: this._termManager,
      onRenderList: () => this._renderList(),
      onShowLog: (f, run) => this._termManager.showRunLog(f, run),
      onRun: (flowId) => window.api.flow.runNow(flowId),
      onToggle: (flowId) => window.api.flow.toggle(flowId),
      onRefresh: () => this.refresh(),
      onOpenModal: (f) => this._openModal(f),
      onDeleteFlow: (id) => this._deleteFlow(id),
    }, flow, catId);
  }

  async _deleteFlow(flowId) {
    this._termManager.disposeLiveTerminal(flowId);
    removeFlowFromOrder(this.catData.order, flowId);
    await this._persistCategories();
    await window.api.flow.delete(flowId);
    this.refresh();
  }

  // --- Category management ---

  async _addCategory() {
    const name = await showPromptDialog({
      title: 'Nouvelle catégorie',
      placeholder: 'Nom de la catégorie',
      confirmLabel: 'Créer',
      cancelLabel: 'Annuler',
    });
    if (!name) return;
    const cat = { id: generateId('cat'), name };
    this.catData.categories.push(cat);
    this.catData.order[cat.id] = [];
    await this._persistCategories();
    this._renderList();
  }

  _renameCategoryInline(catId, nameEl) {
    const cat = this.catData.categories.find(c => c.id === catId);
    if (!cat) return;

    const finish = async (newName) => {
      if (newName && newName !== cat.name) cat.name = newName;
      await this._persistCategories();
      this._renderList();
    };

    startInlineRename(nameEl, {
      className: 'flow-category-name-input',
      value: cat.name,
      onCommit: finish,
      onCancel: () => finish(null),
    });
  }

  async _deleteCategory(catId) {
    if (!deleteCategoryData(this.catData, catId)) return;
    await this._persistCategories();
    this._renderList();
  }

  // ===== Creation / Edit Modal =====

  async _openModal(existing = null) {
    const openFlowModal = getComponent('openFlowModal');
    const flow = await openFlowModal(existing, this.catData.categories);
    if (flow) {
      const catId = flow._category;
      delete flow._category;

      await window.api.flow.save(flow);

      if (catId) {
        this._moveFlowToCategory(flow.id, catId);
      } else if (!existing) {
        if (!this.catData.order[UNCATEGORIZED]) this.catData.order[UNCATEGORIZED] = [];
        const allOrdered = new Set(Object.values(this.catData.order).flat());
        if (!allOrdered.has(flow.id)) {
          this.catData.order[UNCATEGORIZED].push(flow.id);
          await this._persistCategories();
        }
      }

      this.refresh();
    }
  }

  dispose() {
    this.disposed = true;
    if (this._unsubStarted) this._unsubStarted();
    if (this._unsubComplete) this._unsubComplete();
    this._termManager.disposeAll();
  }
}

registerComponent('FlowView', FlowView);
