/**
 * Card setup helpers for FlowView — wiring drag events and building card body content.
 * Extracted from flow-view.js to reduce component size.
 */

import { _el } from './dom.js';
import { getLastRun } from './flow-view-helpers.js';
import { cleanupAllDragState } from '../components/flow-category-renderer.js';

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
