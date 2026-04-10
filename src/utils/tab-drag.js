/**
 * Tab drag-and-drop reorder logic — extracted from TabManager to keep the
 * component file focused on workspace orchestration.
 *
 * Exports a single factory that wires drag behaviour onto tab elements,
 * reading / writing shared state through an explicit dependency interface.
 *
 * @typedef {Object} TabDragDeps
 * @property {() => Map<string, HTMLElement>} getTabElements  - live tab DOM elements
 * @property {(fromId: string, toId: string, before: boolean) => void} reorderTab - commit the reorder
 */

import { DRAG_THRESHOLD } from './tab-manager-helpers.js';

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
  let dropTargetId = null;
  let dropBefore = true;
  let insertIdx = -1;

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id === dragId) continue;
    const el = getTabElements().get(id);
    const rect = el.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;

    if (mx < midX) {
      dropTargetId = id;
      dropBefore = true;
      insertIdx = i;
      break;
    }
  }

  // If no target found, insert after last
  if (insertIdx === -1) {
    const lastId = orderedIds.filter((id) => id !== dragId).pop();
    if (lastId) {
      dropTargetId = lastId;
      dropBefore = false;
      insertIdx = orderedIds.length;
    }
  }

  return { dropTargetId, dropBefore, insertIdx };
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
 * Apply visual drag-start effects: add CSS class, set cursor, and create
 * a floating ghost clone of the tab element.
 *
 * @returns {HTMLElement} the ghost element appended to document.body
 */
function handleDragStart(tabEl) {
  tabEl.classList.add('tab-dragging');
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';

  // Create floating ghost clone
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
 * Clean up after a drag operation: remove visual effects, commit the
 * reorder if the tab was dropped on a valid target, and reset state.
 *
 * @param {TabDragDeps} deps
 * @param {HTMLElement} tabEl
 * @param {HTMLElement|null} ghost
 * @param {{ dropTargetId: string|null, dropBefore: boolean|null }} state
 * @param {string} tabId
 */
function handleDragEnd({ getTabElements, reorderTab }, tabEl, ghost, state, tabId) {
  tabEl.classList.remove('tab-dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  if (ghost) { ghost.remove(); }
  clearTabShifts(getTabElements);

  if (state.dropTargetId && state.dropTargetId !== tabId) {
    reorderTab(tabId, state.dropTargetId, state.dropBefore);
  }
  state.dropTargetId = null;
  state.dropBefore = null;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Wire drag-to-reorder behaviour on a single tab element.
 *
 * @param {TabDragDeps} deps  — explicit dependency interface
 * @param {HTMLElement} tabEl — the tab DOM element
 * @param {string} tabId     — the tab's unique id
 */
export function setupTabDrag({ getTabElements, reorderTab }, tabEl, tabId) {
  let startX = 0;
  let dragging = false;
  let ghost = null;
  let offsetX = 0;

  const state = initDragState();

  tabEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    startX = e.clientX;
    const rect = tabEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    dragging = false;

    const onMouseMove = (ev) => {
      if (!dragging && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD) {
        dragging = true;
        ghost = handleDragStart(tabEl);
      }
      if (dragging && ghost) {
        ghost.style.left = `${ev.clientX - offsetX}px`;
        updateTabDropTarget(getTabElements, state, ev.clientX, tabId);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (dragging) {
        handleDragEnd({ getTabElements, reorderTab }, tabEl, ghost, state, tabId);
        ghost = null;
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
