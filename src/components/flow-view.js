import { _el, showPromptDialog, setupInlineInput } from '../utils/dom.js';
import { generateId } from '../utils/id.js';
import { registerComponent, getComponent } from '../utils/component-registry.js';
import {
  EMPTY_LIST_MESSAGE, UNCATEGORIZED, HEADER_BUTTONS,
  getFlowsForCategory, getUncategorizedFlows,
  removeFlowFromOrder, moveFlowInOrder, deleteCategoryData,
} from '../utils/flow-view-helpers.js';
import { createCardHeader } from '../utils/flow-card-renderer.js';
import { createCategoryGroup } from '../utils/flow-category-renderer.js';
import { setupCardDrag, buildCardBody, setupCardHeaderClick } from '../utils/flow-card-setup.js';


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

  // --- Category helpers ---

  _moveFlowToCategory(flowId, targetCatId, insertIndex = -1) {
    moveFlowInOrder(this.catData.order, flowId, targetCatId, insertIndex);
    this._persistCategories();
  }

  // --- Rendering ---

  render() {
    this.container.replaceChildren();

    const wrapper = _el('div', 'flow-container');

    const header = _el('div', 'flow-header');
    header.appendChild(_el('h2', 'flow-title', 'Flows'));

    const headerRight = _el('div', { className: 'flow-header-right', style: { display: 'flex', gap: '8px' } });
    const headerHandlers = { addCategory: () => this._addCategory(), addFlow: () => this._openModal() };
    for (const { label, action } of HEADER_BUTTONS) {
      const btn = _el('button', 'flow-add-btn', label);
      btn.addEventListener('click', () => headerHandlers[action]());
      headerRight.appendChild(btn);
    }

    header.appendChild(headerRight);
    wrapper.appendChild(header);

    this.listEl = _el('div', 'flow-list');
    wrapper.appendChild(this.listEl);

    this.container.appendChild(wrapper);
  }

  _renderList() {
    if (!this.listEl) return;

    this._termManager.cleanupStaleLiveTerminals(this._runningMap);
    this._termManager.disposeAllLogTerminals();

    this.listEl.replaceChildren();

    const hasCats = this.catData.categories.length > 0;
    const uncatFlows = getUncategorizedFlows(this.flows, this.catData.order);
    const totalFlows = this.flows.length;

    if (totalFlows === 0 && !hasCats) {
      this.listEl.appendChild(_el('div', 'flow-empty', EMPTY_LIST_MESSAGE));
      return;
    }

    const groupParams = (cat, flows, isUncat = false) => ({
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
    });

    // Render categorized groups
    for (const cat of this.catData.categories) {
      const flows = getFlowsForCategory(this.flows, this.catData.order, cat.id);
      this.listEl.appendChild(createCategoryGroup(groupParams(cat, flows)));
    }

    // Render uncategorized
    if (uncatFlows.length > 0 || hasCats) {
      if (hasCats) {
        this.listEl.appendChild(createCategoryGroup(
          groupParams({ id: UNCATEGORIZED, name: 'Sans catégorie' }, uncatFlows, true)
        ));
      } else {
        for (const flow of uncatFlows) {
          this.listEl.appendChild(this._createCard(flow, UNCATEGORIZED));
        }
      }
    }
  }

  _toggleCollapse(catId) {
    if (this._collapsedCategories.has(catId)) {
      this._collapsedCategories.delete(catId);
    } else {
      this._collapsedCategories.add(catId);
    }
    this._renderList();
  }

  // --- Card rendering ---

  _createCard(flow, catId) {
    const isRunning = !!this._runningMap[flow.id];
    const isExpanded = this._expandedCards.has(flow.id);

    const card = _el('div', 'flow-card');
    card.dataset.flowId = flow.id;
    card.draggable = true;

    if (!flow.enabled) card.classList.add('flow-card-disabled');
    if (isRunning) card.classList.add('flow-card-running');
    if (isExpanded) card.classList.add('flow-card-expanded');

    setupCardDrag(card, flow.id, catId, this._drag);

    const headerRow = createCardHeader(flow, isRunning, isExpanded, {
      onToggleOutput: (flowId) => {
        if (this._expandedCards.has(flowId)) this._expandedCards.delete(flowId);
        else this._expandedCards.add(flowId);
        this._renderList();
      },
      onShowLog: (f, run) => this._termManager.showRunLog(f, run),
      actionHandlers: {
        run:    () => window.api.flow.runNow(flow.id),
        toggle: async () => { await window.api.flow.toggle(flow.id); this.refresh(); },
        edit:   () => this._openModal(flow),
        delete: () => this._deleteFlow(flow.id),
      },
    });
    card.appendChild(headerRow);

    const body = buildCardBody(flow, isRunning, isExpanded, this._termManager, this._runningMap);
    if (body) card.appendChild(body);

    setupCardHeaderClick(headerRow, flow, isRunning, {
      expandedCards: this._expandedCards,
      onRenderList: () => this._renderList(),
      onOpenModal: (f) => this._openModal(f),
      termManager: this._termManager,
    });

    return card;
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

    const input = _el('input', {
      className: 'flow-category-name-input',
      value: cat.name,
    });

    nameEl.parentNode.replaceChild(input, nameEl);
    input.focus();
    input.select();

    const finish = async (newName) => {
      if (newName && newName !== cat.name) cat.name = newName;
      await this._persistCategories();
      this._renderList();
    };

    setupInlineInput(input, {
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
