import { openFlowModal } from './flow-modal.js';
import { formatSchedule } from '../utils/flow-schedule-helpers.js';
import { _el, showPromptDialog, setupInlineInput } from '../utils/dom.js';
import { generateId } from '../utils/id.js';
import { registerComponent } from '../utils/component-registry.js';
import {
  EMPTY_LIST_MESSAGE, MAX_VISIBLE_RUNS, UNCATEGORIZED,
  HEADER_BUTTONS,
  buildDotTooltip, buildCardActionEntries,
  getFlowsForCategory, getUncategorizedFlows,
  removeFlowFromOrder, moveFlowInOrder, deleteCategoryData,
  getLastRun,
} from '../utils/flow-view-helpers.js';
import { FlowCardTerminalManager } from './flow-card-terminal.js';
import { createCategoryGroup, cleanupAllDragState } from './flow-category-renderer.js';


export class FlowView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.flows = [];
    this.catData = { categories: [], order: {} };
    this.disposed = false;
    this._termManager = new FlowCardTerminalManager();
    this._expandedCards = new Set();
    this._collapsedCategories = new Set();
    this._runningMap = {};

    // Drag state
    this._dragFlowId = null;
    this._dragSourceCat = null;

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
        getDragFlowId: () => this._dragFlowId,
        clearDrag: () => { this._dragFlowId = null; this._dragSourceCat = null; },
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

    this._setupCardDrag(card, flow.id, catId);

    const headerRow = this._createCardHeader(flow, isRunning, isExpanded);
    card.appendChild(headerRow);

    const body = this._buildCardBody(flow, isRunning, isExpanded);
    if (body) card.appendChild(body);

    this._setupCardHeaderClick(headerRow, flow, isRunning);

    return card;
  }

  _setupCardDrag(card, flowId, catId) {
    card.addEventListener('dragstart', (e) => {
      this._dragFlowId = flowId;
      this._dragSourceCat = catId;
      card.classList.add('flow-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', flowId);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('flow-dragging');
      this._dragFlowId = null;
      this._dragSourceCat = null;
      cleanupAllDragState();
    });
  }

  _buildCardBody(flow, isRunning, isExpanded) {
    if (isRunning) {
      const container = this._termManager.createLiveTerminal(flow.id, this._runningMap[flow.id]);
      container.style.display = isExpanded ? '' : 'none';
      return container;
    }
    if (isExpanded) {
      const lastRun = getLastRun(flow);
      if (lastRun) {
        const termArea = _el('div', 'flow-card-terminal');
        this._termManager.loadLogIntoContainer(flow.id, lastRun, termArea);
        return termArea;
      }
    }
    return null;
  }

  _setupCardHeaderClick(headerRow, flow, isRunning) {
    headerRow.addEventListener('click', () => {
      if (isRunning) {
        if (this._expandedCards.has(flow.id)) this._expandedCards.delete(flow.id);
        else this._expandedCards.add(flow.id);
        this._renderList();
        return;
      }
      if (!flow.runs?.length) {
        this._openModal(flow);
        return;
      }
      if (this._expandedCards.has(flow.id)) {
        this._expandedCards.delete(flow.id);
        this._termManager.disposeLogTerminal(flow.id);
      } else {
        this._expandedCards.add(flow.id);
      }
      this._renderList();
    });
  }

  _createCardHeader(flow, isRunning, isExpanded) {
    const headerRow = _el('div', 'flow-card-header');

    const info = _el('div', 'flow-card-info');
    const nameRow = _el('div', 'flow-card-name-row');
    nameRow.appendChild(_el('span', 'flow-card-name', flow.name));
    if (isRunning) nameRow.appendChild(_el('span', 'flow-running-badge', 'En cours...'));
    if (isRunning) {
      nameRow.appendChild(_el('button', {
        className: 'flow-output-toggle',
        textContent: isExpanded ? '▾ Sortie' : '▸ Sortie',
        title: isExpanded ? 'Masquer la sortie' : 'Afficher la sortie',
        onClick: (e) => {
          e.stopPropagation();
          if (this._expandedCards.has(flow.id)) this._expandedCards.delete(flow.id);
          else this._expandedCards.add(flow.id);
          this._renderList();
        },
      }));
    }
    info.appendChild(nameRow);
    info.appendChild(_el('div', 'flow-card-schedule', formatSchedule(flow.schedule)));
    headerRow.appendChild(info);

    const right = _el('div', 'flow-card-right');
    right.appendChild(this._createRunDots(flow));
    right.appendChild(this._createCardActions(flow, isRunning));
    headerRow.appendChild(right);

    return headerRow;
  }

  _createRunDots(flow) {
    const dots = _el('div', 'flow-card-dots');
    for (const run of (flow.runs || []).slice(-MAX_VISIBLE_RUNS)) {
      const dot = _el('button', `flow-dot flow-dot-${run.status}`);
      dot.title = buildDotTooltip(run);
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        this._termManager.showRunLog(flow, run);
      });
      dots.appendChild(dot);
    }
    return dots;
  }

  _createCardActions(flow, isRunning) {
    const actions = _el('div', 'flow-card-actions');
    const handlers = {
      run:    () => window.api.flow.runNow(flow.id),
      toggle: async () => { await window.api.flow.toggle(flow.id); this.refresh(); },
      edit:   () => this._openModal(flow),
      delete: () => this._deleteFlow(flow.id),
    };
    for (const { icon, title, action, cls } of buildCardActionEntries(flow, isRunning)) {
      actions.appendChild(this._createActionButton(icon, title, handlers[action], cls));
    }
    return actions;
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

  // === Action button helper ===

  _createActionButton(icon, title, onClick, extraClass = '') {
    const btn = _el('button', extraClass ? `flow-card-btn ${extraClass}` : 'flow-card-btn', icon);
    btn.title = title;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  // ===== Creation / Edit Modal =====

  async _openModal(existing = null) {
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
