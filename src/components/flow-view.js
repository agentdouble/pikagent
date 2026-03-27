import { openFlowModal } from './flow-modal.js';
import { SCHEDULE_LABELS, DAY_NAMES, formatSchedule } from '../utils/flow-schedule-helpers.js';
import { _el, _safeFit } from '../utils/dom.js';
import { createTerminal, disposeTerminal } from '../utils/terminal-factory.js';
import { generateId } from '../utils/id.js';

const FIT_DELAY_MS = 50;
const LOG_SCROLLBACK = 50000;
const LIVE_SCROLLBACK = 10000;

const STATUS_LABELS = { success: 'Succès', error: 'Erreur' };
const NO_LOG_MESSAGE = '\r\n  Log non disponible pour ce run.\r\n';
const NO_LOG_MODAL_MESSAGE = '\r\n  Log non disponible.\r\n';
const EMPTY_LIST_MESSAGE = 'Aucun flow. Créez-en un pour automatiser vos tâches.';
const MAX_VISIBLE_RUNS = 5;
const UNCATEGORIZED = '_uncategorized';


export class FlowView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.flows = [];
    this.catData = { categories: [], order: {} };
    this.disposed = false;
    this._liveTerminals = new Map();
    this._logTerminals = new Map();
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
      this._disposeLiveTerminal(flowId);
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

  _getFlowsForCategory(catId) {
    const orderedIds = this.catData.order[catId] || [];
    const flowMap = new Map(this.flows.map(f => [f.id, f]));
    const ordered = orderedIds.map(id => flowMap.get(id)).filter(Boolean);
    return ordered;
  }

  _getUncategorizedFlows() {
    const assigned = new Set();
    for (const ids of Object.values(this.catData.order)) {
      for (const id of ids) assigned.add(id);
    }
    const unordered = this.flows.filter(f => !assigned.has(f.id));
    const orderedIds = this.catData.order[UNCATEGORIZED] || [];
    const flowMap = new Map(this.flows.map(f => [f.id, f]));
    const ordered = orderedIds.map(id => flowMap.get(id)).filter(Boolean);
    // Add any flows not in the order list
    const inOrder = new Set(orderedIds);
    for (const f of unordered) {
      if (!inOrder.has(f.id)) ordered.push(f);
    }
    return ordered;
  }

  _moveFlowToCategory(flowId, targetCatId, insertIndex = -1) {
    // Remove from all categories
    for (const key of Object.keys(this.catData.order)) {
      this.catData.order[key] = this.catData.order[key].filter(id => id !== flowId);
    }
    // Add to target
    if (!this.catData.order[targetCatId]) this.catData.order[targetCatId] = [];
    const arr = this.catData.order[targetCatId];
    if (insertIndex >= 0 && insertIndex < arr.length) {
      arr.splice(insertIndex, 0, flowId);
    } else {
      arr.push(flowId);
    }
    this._persistCategories();
  }

  // --- Rendering ---

  _disposeAllFromMap(map) {
    for (const [flowId] of map) {
      this._disposeTerminalEntry(map, flowId);
    }
  }

  render() {
    this.container.replaceChildren();

    const wrapper = _el('div', 'flow-container');

    const header = _el('div', 'flow-header');
    header.appendChild(_el('h2', 'flow-title', 'Flows'));

    const headerRight = _el('div', { className: 'flow-header-right', style: { display: 'flex', gap: '8px' } });
    const addCatBtn = _el('button', 'flow-add-btn', '+ Catégorie');
    addCatBtn.addEventListener('click', () => this._addCategory());
    headerRight.appendChild(addCatBtn);

    const addBtn = _el('button', 'flow-add-btn', '+ Nouveau');
    addBtn.addEventListener('click', () => this._openModal());
    headerRight.appendChild(addBtn);

    header.appendChild(headerRight);
    wrapper.appendChild(header);

    this.listEl = _el('div', 'flow-list');
    wrapper.appendChild(this.listEl);

    this.container.appendChild(wrapper);
  }

  _renderList() {
    if (!this.listEl) return;

    for (const [flowId] of this._liveTerminals) {
      if (!this._runningMap[flowId]) this._disposeLiveTerminal(flowId);
    }
    this._disposeAllFromMap(this._logTerminals);

    this.listEl.replaceChildren();

    const hasCats = this.catData.categories.length > 0;
    const uncatFlows = this._getUncategorizedFlows();
    const totalFlows = this.flows.length;

    if (totalFlows === 0 && !hasCats) {
      this.listEl.appendChild(_el('div', 'flow-empty', EMPTY_LIST_MESSAGE));
      return;
    }

    // Render categorized groups
    for (const cat of this.catData.categories) {
      const flows = this._getFlowsForCategory(cat.id);
      this.listEl.appendChild(this._createCategoryGroup(cat, flows));
    }

    // Render uncategorized
    if (uncatFlows.length > 0 || hasCats) {
      if (hasCats) {
        this.listEl.appendChild(this._createCategoryGroup(
          { id: UNCATEGORIZED, name: 'Sans catégorie' },
          uncatFlows,
          true
        ));
      } else {
        // No categories exist, just render flat list
        for (const flow of uncatFlows) {
          this.listEl.appendChild(this._createCard(flow, UNCATEGORIZED));
        }
      }
    }
  }

  _createCategoryGroup(cat, flows, isUncategorized = false) {
    const isCollapsed = this._collapsedCategories.has(cat.id);
    const group = _el('div', `flow-category-group${isCollapsed ? ' flow-category-collapsed' : ''}`);
    group.dataset.catId = cat.id;

    // Header
    const header = _el('div', 'flow-category-header');

    const chevron = _el('span', 'flow-category-chevron', '▼');
    header.appendChild(chevron);

    const name = _el('span', 'flow-category-name', cat.name);
    header.appendChild(name);

    const count = _el('span', 'flow-category-count', `${flows.length}`);
    header.appendChild(count);

    if (!isUncategorized) {
      const actions = _el('div', 'flow-category-actions');

      const renameBtn = _el('button', 'flow-category-btn', '✎');
      renameBtn.title = 'Renommer';
      renameBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._renameCategoryInline(cat.id, name);
      });
      actions.appendChild(renameBtn);

      const deleteBtn = _el('button', 'flow-category-btn flow-category-btn-danger', '✕');
      deleteBtn.title = 'Supprimer la catégorie';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteCategory(cat.id);
      });
      actions.appendChild(deleteBtn);

      header.appendChild(actions);
    }

    header.addEventListener('click', () => {
      if (this._collapsedCategories.has(cat.id)) {
        this._collapsedCategories.delete(cat.id);
      } else {
        this._collapsedCategories.add(cat.id);
      }
      this._renderList();
    });

    group.appendChild(header);

    // Items container (drop zone)
    const items = _el('div', 'flow-category-items');
    items.dataset.catId = cat.id;

    // Drop zone events
    items.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      items.classList.add('flow-drop-zone-active');
      this._updateDropIndicator(items, e.clientY);
    });

    items.addEventListener('dragleave', (e) => {
      if (!items.contains(e.relatedTarget)) {
        items.classList.remove('flow-drop-zone-active');
        this._clearDropIndicators(items);
      }
    });

    items.addEventListener('drop', (e) => {
      e.preventDefault();
      items.classList.remove('flow-drop-zone-active');
      this._clearDropIndicators(items);

      if (!this._dragFlowId) return;

      const insertIndex = this._getDropIndex(items, e.clientY);
      this._moveFlowToCategory(this._dragFlowId, cat.id, insertIndex);
      this._dragFlowId = null;
      this._dragSourceCat = null;
      this._renderList();
    });

    if (!isCollapsed) {
      for (const flow of flows) {
        items.appendChild(this._createCard(flow, cat.id));
      }
      if (flows.length === 0) {
        const empty = _el('div', {
          className: 'flow-empty',
          style: { padding: '12px 0', fontSize: '12px' },
          textContent: 'Glissez un flow ici',
        });
        items.appendChild(empty);
      }
    }

    group.appendChild(items);
    return group;
  }

  // --- Drag & Drop helpers ---

  _updateDropIndicator(container, clientY) {
    this._clearDropIndicators(container);

    const cards = [...container.querySelectorAll(':scope > .flow-card')];
    if (cards.length === 0) return;

    let insertBefore = null;
    for (const card of cards) {
      const rect = card.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) {
        insertBefore = card;
        break;
      }
    }

    const indicator = _el('div', 'flow-drop-indicator flow-drop-active');
    if (insertBefore) {
      container.insertBefore(indicator, insertBefore);
    } else {
      container.appendChild(indicator);
    }
  }

  _clearDropIndicators(container) {
    for (const el of container.querySelectorAll('.flow-drop-indicator')) {
      el.remove();
    }
  }

  _getDropIndex(container, clientY) {
    const cards = [...container.querySelectorAll(':scope > .flow-card')];
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return i;
    }
    return -1; // append at end
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

    // Drag events
    card.addEventListener('dragstart', (e) => {
      this._dragFlowId = flow.id;
      this._dragSourceCat = catId;
      card.classList.add('flow-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', flow.id);
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('flow-dragging');
      this._dragFlowId = null;
      this._dragSourceCat = null;
      // Clean up all drop indicators
      for (const el of document.querySelectorAll('.flow-drop-indicator')) el.remove();
      for (const el of document.querySelectorAll('.flow-drop-zone-active')) {
        el.classList.remove('flow-drop-zone-active');
      }
    });

    const headerRow = this._createCardHeader(flow, isRunning);
    card.appendChild(headerRow);

    if (isRunning) {
      card.appendChild(this._createLiveTerminal(flow.id, this._runningMap[flow.id]));
    } else if (isExpanded) {
      const lastRun = (flow.runs || []).slice(-1)[0];
      if (lastRun) {
        const termArea = _el('div', 'flow-card-terminal');
        card.appendChild(termArea);
        this._loadLogIntoContainer(flow.id, lastRun, termArea);
      }
    }

    headerRow.addEventListener('click', () => {
      if (isRunning) return;
      if (!flow.runs?.length) {
        this._openModal(flow);
        return;
      }
      if (this._expandedCards.has(flow.id)) {
        this._expandedCards.delete(flow.id);
        this._disposeLogTerminal(flow.id);
      } else {
        this._expandedCards.add(flow.id);
      }
      this._renderList();
    });

    return card;
  }

  _createCardHeader(flow, isRunning) {
    const headerRow = _el('div', 'flow-card-header');

    const info = _el('div', 'flow-card-info');
    const nameRow = _el('div', 'flow-card-name-row');
    nameRow.appendChild(_el('span', 'flow-card-name', flow.name));
    if (isRunning) nameRow.appendChild(_el('span', 'flow-running-badge', 'En cours...'));
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
      dot.title = `${run.date} — ${STATUS_LABELS[run.status] || run.status}\nCliquer pour voir le log`;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showRunLog(flow, run);
      });
      dots.appendChild(dot);
    }
    return dots;
  }

  _createCardActions(flow, isRunning) {
    const actions = _el('div', 'flow-card-actions');

    const buttons = [
      !isRunning && ['▶', 'Exécuter maintenant', () => window.api.flow.runNow(flow.id)],
      [flow.enabled ? '⏸' : '⏵', flow.enabled ? 'Désactiver' : 'Activer',
        async () => { await window.api.flow.toggle(flow.id); this.refresh(); }],
      ['✎', 'Modifier', () => this._openModal(flow)],
      ['✕', 'Supprimer', async () => {
        this._disposeLiveTerminal(flow.id);
        // Remove from category ordering
        for (const key of Object.keys(this.catData.order)) {
          this.catData.order[key] = this.catData.order[key].filter(id => id !== flow.id);
        }
        await this._persistCategories();
        await window.api.flow.delete(flow.id);
        this.refresh();
      }, 'flow-card-btn-danger'],
    ];

    for (const entry of buttons) {
      if (entry) actions.appendChild(this._createActionButton(...entry));
    }

    return actions;
  }

  // --- Category management ---

  _addCategory() {
    const overlay = _el('div', 'flow-modal-overlay');
    const modal = _el('div', {
      className: 'flow-modal',
      style: { width: '360px' },
    });

    const header = _el('div', 'flow-modal-header',
      _el('h3', { textContent: 'Nouvelle catégorie' }),
    );

    const input = _el('input', {
      className: 'flow-modal-input',
      placeholder: 'Nom de la catégorie',
    });
    const group = _el('div', 'flow-modal-group', input);

    const close = () => overlay.remove();

    const confirm = async () => {
      const name = input.value.trim();
      if (!name) return;
      close();
      const cat = { id: generateId('cat'), name };
      this.catData.categories.push(cat);
      this.catData.order[cat.id] = [];
      await this._persistCategories();
      this._renderList();
    };

    const actionBar = _el('div', 'flow-modal-actions',
      _el('button', {
        className: 'flow-modal-btn flow-modal-btn-cancel',
        textContent: 'Annuler',
        onClick: close,
      }),
      _el('button', {
        className: 'flow-modal-btn flow-modal-btn-create',
        textContent: 'Créer',
        onClick: confirm,
      }),
    );

    modal.append(header, group, actionBar);
    overlay.appendChild(modal);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);
    input.focus();

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') close();
    });
  }

  _renameCategoryInline(catId, nameEl) {
    const cat = this.catData.categories.find(c => c.id === catId);
    if (!cat) return;

    const input = _el('input', {
      className: 'flow-category-name-input',
      value: cat.name,
    });

    const parent = nameEl.parentNode;
    parent.replaceChild(input, nameEl);
    input.focus();
    input.select();

    const commit = async () => {
      const newName = input.value.trim();
      if (newName) cat.name = newName;
      await this._persistCategories();
      this._renderList();
    };

    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = cat.name; input.blur(); }
    });
  }

  async _deleteCategory(catId) {
    const cat = this.catData.categories.find(c => c.id === catId);
    if (!cat) return;

    // Move flows to uncategorized
    const flowIds = this.catData.order[catId] || [];
    if (!this.catData.order[UNCATEGORIZED]) this.catData.order[UNCATEGORIZED] = [];
    this.catData.order[UNCATEGORIZED].push(...flowIds);

    // Remove category
    this.catData.categories = this.catData.categories.filter(c => c.id !== catId);
    delete this.catData.order[catId];

    await this._persistCategories();
    this._renderList();
  }

  // === Live Terminal (for running flows) ===

  _createActionButton(icon, title, onClick, extraClass = '') {
    const btn = _el('button', extraClass ? `flow-card-btn ${extraClass}` : 'flow-card-btn', icon);
    btn.title = title;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  _createReadonlyTerminal(containerEl, termOpts = {}) {
    return createTerminal(containerEl, {
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: false,
      disableStdin: true,
      scrollback: LIVE_SCROLLBACK,
      autoResize: true,
      fitDelay: FIT_DELAY_MS,
      ...termOpts,
    });
  }

  _createLiveTerminal(flowId, ptyId) {
    const existing = this._liveTerminals.get(flowId);
    if (existing) {
      setTimeout(() => _safeFit(existing.fitAddon), FIT_DELAY_MS);
      return existing.containerEl;
    }

    const containerEl = _el('div', 'flow-card-terminal');

    const { term, fitAddon, resizeObs } = this._createReadonlyTerminal(containerEl, {
      scrollback: LIVE_SCROLLBACK,
      cursorStyle: 'bar',
    });

    const unsubData = window.api.pty.onData(ptyId, (data) => {
      term.write(data);
    });

    this._liveTerminals.set(flowId, { term, fitAddon, unsubData, resizeObs, containerEl, ptyId });

    return containerEl;
  }

  _disposeTerminalEntry(map, flowId) {
    const data = map.get(flowId);
    if (!data) return;
    disposeTerminal(data);
    map.delete(flowId);
  }

  _disposeLiveTerminal(flowId) {
    this._disposeTerminalEntry(this._liveTerminals, flowId);
  }

  // === Inline Log Terminal (expanded card) ===

  async _loadLogIntoContainer(flowId, run, containerEl) {
    const log = run.logTimestamp
      ? await window.api.flow.getRunLog(flowId, run.logTimestamp)
      : null;

    const { term, fitAddon, resizeObs } = this._createReadonlyTerminal(containerEl, {
      scrollback: LOG_SCROLLBACK,
    });

    term.write(log || NO_LOG_MESSAGE);
    this._logTerminals.set(flowId, { term, fitAddon, resizeObs });
  }

  _disposeLogTerminal(flowId) {
    this._disposeTerminalEntry(this._logTerminals, flowId);
  }

  // === Past Run Log Viewer (modal) ===

  async _showRunLog(flow, run) {
    const log = await window.api.flow.getRunLog(flow.id, run.logTimestamp);

    const overlay = _el('div', 'flow-modal-overlay');
    const modal = _el('div', 'flow-log-modal');

    const header = _el('div', 'flow-log-header');
    header.appendChild(_el('span', 'flow-log-title', `${flow.name} — ${run.date}`));
    header.appendChild(_el('span', `flow-log-status flow-log-status-${run.status}`, STATUS_LABELS[run.status] || run.status));
    const closeBtn = _el('button', 'flow-log-close', '✕');
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const termContainer = _el('div', 'flow-log-terminal');
    modal.appendChild(termContainer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const { term, resizeObs } = this._createReadonlyTerminal(termContainer, {
      scrollback: LOG_SCROLLBACK,
    });

    term.write(log || NO_LOG_MODAL_MESSAGE);

    const close = () => {
      resizeObs.disconnect();
      term.dispose();
      overlay.remove();
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  // ===== Creation / Edit Modal =====

  async _openModal(existing = null) {
    const flow = await openFlowModal(existing, this.catData.categories);
    if (flow) {
      // Handle category assignment from modal
      const catId = flow._category;
      delete flow._category;

      await window.api.flow.save(flow);

      // Update category ordering
      if (catId) {
        this._moveFlowToCategory(flow.id, catId);
      } else if (!existing) {
        // New flow, add to uncategorized order
        if (!this.catData.order[UNCATEGORIZED]) this.catData.order[UNCATEGORIZED] = [];
        // Only add if not already in any category
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
    this._disposeAllFromMap(this._liveTerminals);
    this._disposeAllFromMap(this._logTerminals);
  }
}
