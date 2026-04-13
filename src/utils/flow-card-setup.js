/**
 * Card setup helpers for FlowView — wiring drag events and building card body content.
 * Extracted from flow-view.js to reduce component size.
 */

import { _el } from './dom.js';
import { getLastRun, toggleInSet } from './flow-view-helpers.js';
import { cleanupAllDragState } from './flow-category-renderer.js';
import { createCardHeader } from './flow-card-renderer.js';

/**
 * Attach dragstart / dragend handlers to a flow card element.
 *
 * @param {HTMLElement} card
 * @param {string} flowId
 * @param {string} catId
 * @param {{ flowId: string|null, catId: string|null }} dragState - mutable drag state object
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
 * @param {{ id: string, runs?: Array<unknown>, enabled?: boolean }} flow
 * @param {boolean} isRunning
 * @param {boolean} isExpanded
 * @param {{ createLiveTerminal: (flowId: string, ptyId: string) => HTMLElement, loadLogIntoContainer: (flowId: string, run: unknown, container: HTMLElement) => void, disposeLogTerminal: (flowId: string) => void }} termManager - FlowCardTerminalManager instance
 * @param {Record<string, string>} runningMap - { [flowId]: ptyId }
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
 * @param {{ id: string, runs?: Array<unknown>, enabled?: boolean }} flow
 * @param {boolean} isRunning
 * @param {{ expandedCards: Set<string>, onRenderList: () => void, onOpenModal: (flow: { id: string, runs?: Array<unknown>, enabled?: boolean }) => void, termManager: { disposeLogTerminal: (flowId: string) => void } }} callbacks
 */
export function setupCardHeaderClick(headerRow, flow, isRunning, { expandedCards, onRenderList, onOpenModal, termManager }) {
  headerRow.addEventListener('click', () => {
    if (isRunning) {
      toggleInSet(expandedCards, flow.id);
      onRenderList();
      return;
    }
    if (!flow.runs?.length) {
      onOpenModal(flow);
      return;
    }
    if (!toggleInSet(expandedCards, flow.id)) {
      termManager.disposeLogTerminal(flow.id);
    }
    onRenderList();
  });
}

/**
 * Build a complete flow card element.
 *
 * @typedef {object} CreateFlowCardDeps
 * @property {Record<string, string>} runningMap        - { [flowId]: ptyId }
 * @property {Set<string>} expandedCards
 * @property {{ flowId: string|null, catId: string|null }} drag - mutable drag state
 * @property {{ createLiveTerminal: (flowId: string, ptyId: string) => HTMLElement, loadLogIntoContainer: (flowId: string, run: unknown, container: HTMLElement) => void, disposeLogTerminal: (flowId: string) => void }} termManager - FlowCardTerminalManager instance
 * @property {() => void} onRenderList
 * @property {(flow: { id: string }, run: unknown) => void} onShowLog
 * @property {(flowId: string) => void} onRun
 * @property {(flowId: string) => Promise<void>} onToggle
 * @property {() => void} onRefresh
 * @property {(flow: { id: string }) => void} onOpenModal
 * @property {(flowId: string) => void} onDeleteFlow
 *
 * @param {CreateFlowCardDeps} deps
 * @param {{ id: string, runs?: Array<unknown>, enabled?: boolean }} flow
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
      toggleInSet(deps.expandedCards, flowId);
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
