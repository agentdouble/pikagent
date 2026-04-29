/**
 * Shared mouse-drag utility — single source of truth for cursor management,
 * selection prevention, body class toggling, RAF throttling, and cleanup.
 *
 * Pure DOM helper — no component dependencies.
 */

/** Set cursor and disable text selection on document.body during a drag. */
function setDragBodyState(cursor) {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = 'none';
}

/** Clear cursor and re-enable text selection on document.body after a drag. */
function clearDragBodyState() {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

/**
 * Start a mouse-drag session: set cursor, throttle moves via RAF, clean up on mouseup.
 * @param {string} cursor - CSS cursor value during the drag (e.g. 'grabbing', 'col-resize')
 * @param {(e: MouseEvent) => void} onMove - called on each mousemove (RAF-throttled)
 * @param {() => void} onDone - called after cleanup on mouseup
 * @param {{ bodyClass?: string }} [opts] - optional overrides (bodyClass defaults to 'resizing')
 */
export function trackMouse(cursor, onMove, onDone, { bodyClass = 'resizing' } = {}) {
  let rafPending = false;
  const move = (e) => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; onMove(e); });
  };
  const cleanup = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    clearDragBodyState();
    if (bodyClass) document.body.classList.remove(bodyClass);
  };
  const up = () => {
    cleanup();
    onDone();
  };
  setDragBodyState(cursor);
  if (bodyClass) document.body.classList.add(bodyClass);
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  return cleanup;
}

/**
 * Named-params variant of trackMouse for callers that prefer destructuring.
 *
 * Adds mousemove and mouseup listeners on document, applies cursor and
 * userSelect on document.body, and cleans everything up automatically on
 * mouseup.
 *
 * @param {{ cursor?: string, onMove: (e: MouseEvent) => void, onUp?: () => void, bodyClass?: string }} opts
 */
export function trackMouseDrag({ cursor = 'default', onMove, onUp = () => {}, bodyClass = 'resizing' } = {}) {
  return trackMouse(cursor, onMove, onUp, { bodyClass });
}

/**
 * Add an event listener to a target and return a cleanup function that
 * removes it.  Calling the cleanup is idempotent.
 *
 * Replaces the repeated "removeEventListener + addEventListener" pattern
 * used to ensure only one listener is active at a time.
 *
 * @param {EventTarget} target
 * @param {string} type
 * @param {EventListener} handler
 * @param {boolean|AddEventListenerOptions} [options]
 * @returns {() => void} cleanup — removes the listener when called
 */
export function addListener(target, type, handler, options) {
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

/**
 * Build dragstart / dragend handlers that toggle a CSS class on the element
 * and set / clear a key on a shared state object.
 *
 * This extracts the repeated pattern found in flow-card-setup and tab-drag:
 *   dragstart → element.classList.add(dragClass), stateObj[stateKey] = value
 *   dragend   → element.classList.remove(dragClass), stateObj[stateKey] = null
 *
 * @param {HTMLElement} element   — the draggable element
 * @param {string} dragClass     — CSS class toggled during the drag
 * @param {Record<string, unknown>} stateObj — mutable state object
 * @param {string} stateKey      — key to set on stateObj
 * @param {unknown} value        — value written at dragstart (cleared to null at dragend)
 * @param {{ onStart?: (e?: DragEvent) => void, onEnd?: (e?: DragEvent) => void }} [extras]
 *        — optional extra work to run after the class/state bookkeeping
 * @returns {{ onDragStart: (e?: DragEvent) => void, onDragEnd: (e?: DragEvent) => void }}
 */
export function setupSimpleDragState(element, dragClass, stateObj, stateKey, value, { onStart, onEnd } = {}) {
  const onDragStart = (e) => {
    stateObj[stateKey] = value;
    element.classList.add(dragClass);
    if (onStart) onStart(e);
  };
  const onDragEnd = (e) => {
    element.classList.remove(dragClass);
    stateObj[stateKey] = null;
    if (onEnd) onEnd(e);
  };
  return { onDragStart, onDragEnd };
}

/**
 * Compute the insertion index for a drag-and-drop operation by comparing
 * the cursor position to the midpoints of the container's child elements.
 *
 * Works on both axes: pass `'y'` for vertical lists, `'x'` for horizontal ones.
 *
 * @param {HTMLElement[]} elements  — ordered array of child elements to test against
 * @param {number} cursorPos       — clientX or clientY depending on axis
 * @param {'x'|'y'} [axis='y']    — axis to measure
 * @returns {number} index where the item should be inserted, or -1 to append at end
 */
export function computeInsertionIndex(elements, cursorPos, axis = 'y') {
  const start = axis === 'x' ? 'left' : 'top';
  const size  = axis === 'x' ? 'width' : 'height';

  for (let i = 0; i < elements.length; i++) {
    const rect = elements[i].getBoundingClientRect();
    const mid = rect[start] + rect[size] / 2;
    if (cursorPos < mid) return i;
  }
  return -1; // append at end
}
