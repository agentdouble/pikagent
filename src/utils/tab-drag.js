/**
 * Tab drag-and-drop reorder logic — extracted from TabManager to keep the
 * component file focused on workspace orchestration.
 *
 * Exports a single factory that wires drag behaviour onto tab elements,
 * reading / writing shared state through an explicit dependency interface.
 *
 * @typedef {{ getTabElements: () => Map<string, HTMLElement>, reorderTab: (fromId: string, toId: string, before: boolean) => void }} TabDragDeps
 */

import { DRAG_THRESHOLD } from './tab-constants.js';
import { trackMouse, computeInsertionIndex, setupSimpleDragState } from './drag-helpers.js';

// ── Internal helpers ────────────────────────────────────────────────

/**
 * Reset CSS transforms on every tab element.
 * @param {() => Map<string, HTMLElement>} getTabElements
 */
function clearTabShifts(getTabElements) {
  for (const [, el] of getTabElements()) {
    el.style.transform = '';
    el.style.transition = '';
  }
}

/**
 * Determine where the dragged tab should be inserted based on cursor
 * position relative to tab midpoints.
 *
 * @param {() => Map<string, HTMLElement>} getTabElements
 * @param {number} mx
 * @param {string[]} orderedIds
 * @param {string} dragId
 * @returns {{ dropTargetId: string|null, dropBefore: boolean, insertIdx: number }}
 */
function computeDropPosition(getTabElements, mx, orderedIds, dragId) {
  // Build the list of non-dragged tab elements in order
  const candidates = orderedIds.filter((id) => id !== dragId);
  const elements = candidates.map((id) => getTabElements().get(id));

  const rawIdx = computeInsertionIndex(elements, mx, 'x');

  if (rawIdx !== -1) {
    // Map back from candidate-space index to orderedIds-space index
    const dropTargetId = candidates[rawIdx];
    const insertIdx = orderedIds.indexOf(dropTargetId);
    return { dropTargetId, dropBefore: true, insertIdx };
  }

  // No target found → insert after last
  const lastId = candidates[candidates.length - 1] ?? null;
  if (lastId) {
    return { dropTargetId: lastId, dropBefore: false, insertIdx: orderedIds.length };
  }
  return { dropTargetId: null, dropBefore: true, insertIdx: -1 };
}

/**
 * Shift surrounding tabs with CSS transforms to open a visual gap at the
 * computed insertion position.
 *
 * @param {() => Map<string, HTMLElement>} getTabElements
 * @param {string[]} orderedIds
 * @param {number} dragIdx
 * @param {number} insertIdx
 * @param {number} shiftAmount
 * @param {string} dragId
 */
function renderDropIndicator(getTabElements, orderedIds, dragIdx, insertIdx, shiftAmount, dragId) {
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id === dragId) continue;
    const el = getTabElements().get(id);
    el.style.transition = 'transform 0.2s ease';

    if (dragIdx < insertIdx) {
      // Dragging right: shift left the tabs between old and new position
      el.style.transform = (i > dragIdx && i < insertIdx) ? `translateX(${-shiftAmount}px)` : '';
    } else if (dragIdx > insertIdx) {
      // Dragging left: shift right the tabs between new and old position
      el.style.transform = (i >= insertIdx && i < dragIdx) ? `translateX(${shiftAmount}px)` : '';
    } else {
      el.style.transform = '';
    }
  }
}

/**
 * While dragging, determine which tab the cursor is over and shift
 * surrounding tabs to open a visual gap.
 *
 * @param {() => Map<string, HTMLElement>} getTabElements
 * @param {{ dropTargetId: string|null, dropBefore: boolean }} state
 * @param {number} mx
 * @param {string} dragId
 */
function updateTabDropTarget(getTabElements, state, mx, dragId) {
  const tabElements = getTabElements();
  const orderedIds = Array.from(tabElements.keys());
  const dragEl = tabElements.get(dragId);
  const shiftAmount = dragEl ? dragEl.getBoundingClientRect().width : 0;
  const dragIdx = orderedIds.indexOf(dragId);

  const { dropTargetId, dropBefore, insertIdx } = computeDropPosition(getTabElements, mx, orderedIds, dragId);

  state.dropTargetId = dropTargetId;
  state.dropBefore = dropBefore;

  renderDropIndicator(getTabElements, orderedIds, dragIdx, insertIdx, shiftAmount, dragId);
}

/** Create initial per-drag transient state. */
function initDragState() {
  return { dropTargetId: null, dropBefore: true };
}

/**
 * Create a floating ghost clone of the tab element.
 * @returns {HTMLElement} the ghost element appended to document.body
 */
function createTabGhost(tabEl) {
  const ghost = tabEl.cloneNode(true);
  ghost.className = 'tab tab-ghost';
  if (tabEl.classList.contains('active')) ghost.classList.add('active');
  const r = tabEl.getBoundingClientRect();
  ghost.style.width = `${r.width}px`;
  ghost.style.height = `${r.height}px`;
  ghost.style.top = `${r.top}px`;
  document.body.appendChild(ghost);
  return ghost;
}

/**
 * Build the paired start / end helpers for a tab drag using the shared
 * setupSimpleDragState pattern (class toggle + state bookkeeping).
 *
 * Body cursor/userSelect are managed by trackMouse() — not set here.
 *
 * @param {TabDragDeps} deps
 * @param {HTMLElement} tabEl
 * @param {{ dropTargetId: string|null, dropBefore: boolean|null }} state
 * @param {string} tabId
 * @returns {{ startDrag: () => HTMLElement, endDrag: (ghost: HTMLElement|null) => void }}
 */
function buildTabDragHandlers(deps, tabEl, state, tabId) {
  const { getTabElements, reorderTab } = deps;

  const { onDragStart, onDragEnd } = setupSimpleDragState(
    tabEl, 'tab-dragging', state, 'dropTargetId', null, {
      onEnd: () => { state.dropBefore = null; },
    },
  );

  return {
    startDrag() {
      onDragStart(/** @type {any} */ ({}));
      return createTabGhost(tabEl);
    },
    endDrag(ghost) {
      if (ghost) { ghost.remove(); }
      clearTabShifts(getTabElements);

      if (state.dropTargetId && state.dropTargetId !== tabId) {
        reorderTab(tabId, state.dropTargetId, state.dropBefore);
      }
      onDragEnd(/** @type {any} */ ({}));
    },
  };
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Activate the full drag phase: create ghost, wire trackMouse, and handle end.
 * @internal
 */
function activateDrag(deps, tabEl, tabId, state, ctx, ev) {
  const { getTabElements } = deps;
  const { startDrag, endDrag } = buildTabDragHandlers(deps, tabEl, state, tabId);
  ctx.ghost = startDrag();
  ctx.ghost.style.left = `${ev.clientX - ctx.offsetX}px`;
  updateTabDropTarget(getTabElements, state, ev.clientX, tabId);

  trackMouse('grabbing',
    (mv) => {
      ctx.ghost.style.left = `${mv.clientX - ctx.offsetX}px`;
      updateTabDropTarget(getTabElements, state, mv.clientX, tabId);
    },
    () => {
      endDrag(ctx.ghost);
      ctx.ghost = null;
    },
    { bodyClass: 'dragging' },
  );
}

/**
 * Install threshold listeners that wait for a minimum drag distance
 * before activating the full drag phase.
 * @internal
 */
function installThresholdListeners(deps, tabEl, tabId, state, ctx) {
  const onThresholdMove = (ev) => {
    if (Math.abs(ev.clientX - ctx.startX) <= DRAG_THRESHOLD) return;
    document.removeEventListener('mousemove', onThresholdMove);
    document.removeEventListener('mouseup', onThresholdUp);
    activateDrag(deps, tabEl, tabId, state, ctx, ev);
  };

  const onThresholdUp = () => {
    document.removeEventListener('mousemove', onThresholdMove);
    document.removeEventListener('mouseup', onThresholdUp);
  };

  document.addEventListener('mousemove', onThresholdMove);
  document.addEventListener('mouseup', onThresholdUp);
}

/**
 * Wire drag-to-reorder behaviour on a single tab element.
 *
 * @param {TabDragDeps} deps  — explicit dependency interface
 * @param {HTMLElement} tabEl — the tab DOM element
 * @param {string} tabId     — the tab's unique id
 */
export function setupTabDrag(deps, tabEl, tabId) {
  const state = initDragState();
  const ctx = { startX: 0, ghost: null, offsetX: 0 };

  tabEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    ctx.startX = e.clientX;
    const rect = tabEl.getBoundingClientRect();
    ctx.offsetX = e.clientX - rect.left;
    installThresholdListeners(deps, tabEl, tabId, state, ctx);
  });
}
