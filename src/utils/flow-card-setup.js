/**
 * Card setup helpers for FlowView — wiring drag events and building card body content.
 * Extracted from flow-view.js to reduce component size.
 */

import { _el } from './dom.js';
import { getLastRun } from './flow-view-helpers.js';
import { cleanupAllDragState } from './flow-category-renderer.js';
import { createCardHeader } from './flow-card-renderer.js';

/**
 * Attach dragstart / dragend handlers to a flow card element.
 *
 * @param {HTMLElement} card
 * @param {string} flowId
 * @param {string} catId
 * @param {Object} dragState - mutable drag state object
 * @param {string|null} dragState.flowId
 * @param {string|null} dragState.catId
 */
export function setupCardDrag(card, flowId, catId, dragState) {
  card.addEventListener('dragstart', (e) => {
    dragState.flowId = flowId;
    dragState.catId = catId;
    card.classList.add('flow-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', flowId);
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('flow-dragging');
    dragState.flowId = null;
    dragState.catId = null;
    cleanupAllDragState();
  });
}

/**
 * Build the collapsible body portion of a flow card (terminal or log view).
 * Returns null when nothing should be rendered.
 *
 * @param {Object} flow
 * @param {boolean} isRunning
 * @param {boolean} isExpanded
 * @param {Object} termManager - FlowCardTerminalManager instance
 * @param {Object} runningMap - { [flowId]: ptyId }
 * @returns {HTMLElement|null}
 */
export function buildCardBody(flow, isRunning, isExpanded, termManager, runningMap) {
  if (isRunning) {
    const container = termManager.createLiveTerminal(flow.id, runningMap[flow.id]);
    container.style.display = isExpanded ? '' : 'none';
    return container;
  }
  if (isExpanded) {
    const lastRun = getLastRun(flow);
    if (lastRun) {
      const termArea = _el('div', 'flow-card-terminal');
      termManager.loadLogIntoContainer(flow.id, lastRun, termArea);
      return termArea;
    }
  }
  return null;
}

/**
 * Wire a click listener on the card header row that toggles card expansion
 * or opens the flow modal when there are no runs.
 *
 * @param {HTMLElement} headerRow
 * @param {Object} flow
 * @param {boolean} isRunning
 * @param {Object} callbacks
 * @param {Set<string>} callbacks.expandedCards
 * @param {Function} callbacks.onRenderList
 * @param {Function} callbacks.onOpenModal - (flow) => void
 * @param {Object} callbacks.termManager
 */
export function setupCardHeaderClick(headerRow, flow, isRunning, { expandedCards, onRenderList, onOpenModal, termManager }) {
  headerRow.addEventListener('click', () => {
    if (isRunning) {
      if (expandedCards.has(flow.id)) expandedCards.delete(flow.id);
      else expandedCards.add(flow.id);
      onRenderList();
      return;
    }
    if (!flow.runs?.length) {
      onOpenModal(flow);
      return;
    }
    if (expandedCards.has(flow.id)) {
      expandedCards.delete(flow.id);
      termManager.disposeLogTerminal(flow.id);
    } else {
      expandedCards.add(flow.id);
    }
    onRenderList();
  });
}

/**
 * Build a complete flow card element.
 *
 * @typedef {Object} CreateFlowCardDeps
 * @property {Object} runningMap        - { [flowId]: ptyId }
 * @property {Set<string>} expandedCards
 * @property {Object} drag              - mutable drag state { flowId, catId }
 * @property {Object} termManager       - FlowCardTerminalManager instance
 * @property {Function} onRenderList    - () => void
 * @property {Function} onShowLog       - (flow, run) => void
 * @property {Function} onRun           - (flowId) => void
 * @property {Function} onToggle        - (flowId) => Promise
 * @property {Function} onRefresh       - () => void
 * @property {Function} onOpenModal     - (flow) => void
 * @property {Function} onDeleteFlow    - (flowId) => void
 *
 * @param {CreateFlowCardDeps} deps
 * @param {Object} flow
 * @param {string} catId
 * @returns {HTMLElement}
 */
export function createFlowCard(deps, flow, catId) {
  const isRunning = !!deps.runningMap[flow.id];
  const isExpanded = deps.expandedCards.has(flow.id);

  const card = _el('div', 'flow-card');
  card.dataset.flowId = flow.id;
  card.draggable = true;

  if (!flow.enabled) card.classList.add('flow-card-disabled');
  if (isRunning) card.classList.add('flow-card-running');
  if (isExpanded) card.classList.add('flow-card-expanded');

  setupCardDrag(card, flow.id, catId, deps.drag);

  const headerRow = createCardHeader(flow, isRunning, isExpanded, {
    onToggleOutput: (flowId) => {
      if (deps.expandedCards.has(flowId)) deps.expandedCards.delete(flowId);
      else deps.expandedCards.add(flowId);
      deps.onRenderList();
    },
    onShowLog: (f, run) => deps.onShowLog(f, run),
    actionHandlers: {
      run:    () => deps.onRun(flow.id),
      toggle: async () => { await deps.onToggle(flow.id); deps.onRefresh(); },
      edit:   () => deps.onOpenModal(flow),
      delete: () => deps.onDeleteFlow(flow.id),
    },
  });
  card.appendChild(headerRow);

  const body = buildCardBody(flow, isRunning, isExpanded, deps.termManager, deps.runningMap);
  if (body) card.appendChild(body);

  setupCardHeaderClick(headerRow, flow, isRunning, {
    expandedCards: deps.expandedCards,
    onRenderList: () => deps.onRenderList(),
    onOpenModal: (f) => deps.onOpenModal(f),
    termManager: deps.termManager,
  });

  return card;
}
