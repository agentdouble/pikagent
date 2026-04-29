/**
 * Card setup helpers for FlowView — wiring drag events and building card body content.
 * Extracted from flow-view.js to reduce component size.
 */

/**
 * @typedef {{ date: string, timestamp: string, logTimestamp?: string, status: string }} FlowRun
 * @typedef {{ id: string, runs?: Array<FlowRun>, enabled?: boolean }} FlowDescriptor
 */

import { _el } from './flow-dom.js';
import { getLastRun, toggleInSet } from './flow-view-helpers.js';
import { cleanupAllDragState } from './flow-drag-cleanup.js';
import { createCardHeader } from './flow-card-renderer.js';
import { onDragEvents } from './event-helpers.js';
import { setupSimpleDragState } from './drag-helpers.js';

/**
 * Attach dragstart / dragend handlers to a flow card element.
 *
 * @param {HTMLElement} card
 * @param {string} flowId
 * @param {string} catId
 * @param {{ flowId: string|null, catId: string|null }} dragState - mutable drag state object
 */
export function setupCardDrag(card, flowId, catId, dragState) {
  const { onDragStart: startFlow, onDragEnd: endFlow } = setupSimpleDragState(
    card, 'flow-dragging', dragState, 'flowId', flowId, {
      onStart: (e) => {
        dragState.catId = catId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', flowId);
      },
      onEnd: () => {
        dragState.catId = null;
        cleanupAllDragState();
      },
    },
  );
  onDragEvents(card, { onDragStart: startFlow, onDragEnd: endFlow });
}

/**
 * Build the collapsible body portion of a flow card (terminal or log view).
 * Returns null when nothing should be rendered.
 *
 * @param {FlowDescriptor} flow
 * @param {boolean} isRunning
 * @param {boolean} isExpanded
 * @param {{ createLiveTerminal: (flowId: string, ptyId: string) => HTMLElement, loadLogIntoContainer: (flowId: string, run: FlowRun, container: HTMLElement) => void, disposeLogTerminal: (flowId: string) => void }} termManager - FlowCardTerminalManager instance
 * @param {Record<string, string>} runningMap - { [flowId]: ptyId }
 * @returns {HTMLElement|null}
 */
function buildCardBody(flow, isRunning, isExpanded, termManager, runningMap) {
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
 * @param {FlowDescriptor} flow
 * @param {boolean} isRunning
 * @param {{ expandedCards: Set<string>, onRenderList: () => void, onOpenModal: (flow: FlowDescriptor) => void, termManager: { disposeLogTerminal: (flowId: string) => void } }} callbacks
 */
function setupCardHeaderClick(headerRow, flow, isRunning, { expandedCards, onRenderList, onOpenModal, termManager }) {
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
 * @typedef {{ runningMap: Record<string, string>, expandedCards: Set<string>, drag: { flowId: string|null, catId: string|null }, termManager: { createLiveTerminal: (flowId: string, ptyId: string) => HTMLElement, loadLogIntoContainer: (flowId: string, run: FlowRun, container: HTMLElement) => void, disposeLogTerminal: (flowId: string) => void }, onRenderList: () => void, onShowLog: (flow: { id: string }, run: FlowRun) => void, onRun: (flowId: string) => void, onToggle: (flowId: string) => Promise<void>, onRefresh: () => void, onOpenModal: (flow: FlowDescriptor) => void, onDeleteFlow: (flowId: string) => void }} CreateFlowCardDeps
 *
 * @param {CreateFlowCardDeps} deps
 * @param {FlowDescriptor} flow
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
