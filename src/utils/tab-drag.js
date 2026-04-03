/**
 * Tab drag-and-drop reorder logic — extracted from TabManager to keep the
 * component file focused on workspace orchestration.
 *
 * Exports a single factory that wires drag behaviour onto tab elements,
 * reading / writing shared state through a thin `ctx` interface.
 *
 * ctx shape (provided by TabManager):
 *   _tabElements   : Map<tabId, HTMLElement>   — live tab DOM elements
 *   reorderTab(fromId, toId, before): void      — commit the reorder
 */

import { DRAG_THRESHOLD } from './tab-manager-helpers.js';

// ── Internal helpers ────────────────────────────────────────────────

/** Reset CSS transforms on every tab element. */
function clearTabShifts(ctx) {
  for (const [, el] of ctx._tabElements) {
    el.style.transform = '';
    el.style.transition = '';
  }
}

/**
 * While dragging, determine which tab the cursor is over and shift
 * surrounding tabs to open a visual gap.
 */
function updateTabDropTarget(ctx, state, mx, dragId) {
  state.dropTargetId = null;
  state.dropBefore = true;

  const orderedIds = Array.from(ctx._tabElements.keys());
  const dragEl = ctx._tabElements.get(dragId);
  const shiftAmount = dragEl ? dragEl.getBoundingClientRect().width : 0;

  let insertIdx = -1;
  const dragIdx = orderedIds.indexOf(dragId);

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id === dragId) continue;
    const el = ctx._tabElements.get(id);
    const rect = el.getBoundingClientRect();
    const midX = rect.left + rect.width / 2;

    if (mx < midX) {
      state.dropTargetId = id;
      state.dropBefore = true;
      insertIdx = i;
      break;
    }
  }

  // If no target found, insert after last
  if (insertIdx === -1) {
    const lastId = orderedIds.filter((id) => id !== dragId).pop();
    if (lastId) {
      state.dropTargetId = lastId;
      state.dropBefore = false;
      insertIdx = orderedIds.length;
    }
  }

  // Shift tabs to make visual gap
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    if (id === dragId) continue;
    const el = ctx._tabElements.get(id);
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

// ── Public API ──────────────────────────────────────────────────────

/**
 * Wire drag-to-reorder behaviour on a single tab element.
 *
 * @param {object} ctx       — TabManager instance (provides _tabElements & reorderTab)
 * @param {HTMLElement} tabEl — the tab DOM element
 * @param {string} tabId     — the tab's unique id
 */
export function setupTabDrag(ctx, tabEl, tabId) {
  let startX = 0;
  let dragging = false;
  let ghost = null;
  let offsetX = 0;

  // Per-drag transient state (not stored on ctx)
  const state = { dropTargetId: null, dropBefore: true };

  tabEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    startX = e.clientX;
    const rect = tabEl.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    dragging = false;

    const onMouseMove = (ev) => {
      if (!dragging && Math.abs(ev.clientX - startX) > DRAG_THRESHOLD) {
        dragging = true;
        tabEl.classList.add('tab-dragging');
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';

        // Create floating ghost clone
        ghost = tabEl.cloneNode(true);
        ghost.className = 'tab tab-ghost';
        if (tabEl.classList.contains('active')) ghost.classList.add('active');
        const r = tabEl.getBoundingClientRect();
        ghost.style.width = `${r.width}px`;
        ghost.style.height = `${r.height}px`;
        ghost.style.top = `${r.top}px`;
        document.body.appendChild(ghost);
      }
      if (dragging && ghost) {
        ghost.style.left = `${ev.clientX - offsetX}px`;
        updateTabDropTarget(ctx, state, ev.clientX, tabId);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      if (dragging) {
        tabEl.classList.remove('tab-dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (ghost) { ghost.remove(); ghost = null; }
        clearTabShifts(ctx);

        if (state.dropTargetId && state.dropTargetId !== tabId) {
          ctx.reorderTab(tabId, state.dropTargetId, state.dropBefore);
        }
        state.dropTargetId = null;
        state.dropBefore = null;
      }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}
