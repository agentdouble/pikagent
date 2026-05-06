/**
 * Shared mouse-drag utility — single source of truth for cursor management,
 * selection prevention, body class toggling, RAF throttling, and cleanup.
 *
 * Pure DOM helper — no component dependencies.
 */

/**
 * Attach a mousedown handler that captures initial state and starts a
 * `trackMouse` session.  Centralises the recurring boilerplate:
 *
 *   element.addEventListener('mousedown', …) → preventDefault / stopPropagation
 *     → onStart(e) → trackMouse(cursor, onMove, onEnd)
 *
 * @param {HTMLElement} element  — element to listen on
 * @param {object}      opts
 * @param {(e: MouseEvent) => any}              [opts.onStart]  — called on mousedown; return value is
 *        forwarded to onMove / onEnd as `ctx`.  Return `false` to abort the drag.
 * @param {(e: MouseEvent, ctx: any) => void}   [opts.onMove]   — called on mousemove (RAF-throttled)
 * @param {(ctx: any) => void}                  [opts.onEnd]    — called on mouseup after cleanup
 * @param {string}                              [opts.cursor='col-resize'] — CSS cursor during drag
 * @param {boolean}                             [opts.stopPropagation=true] — call stopPropagation on mousedown
 * @param {string}                              [opts.bodyClass] — body class during drag (forwarded to trackMouse)
 */
export function setupDragHandler(element, {
  onStart,
  onMove,
  onEnd,
  cursor = 'col-resize',
  stopPropagation = true,
  bodyClass,
} = {}) {
  element.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (stopPropagation) e.stopPropagation();
    const ctx = onStart?.(e);
    if (ctx === false) return;
    trackMouse(
      cursor,
      (ev) => onMove?.(ev, ctx),
      () => onEnd?.(ctx),
      bodyClass != null ? { bodyClass } : undefined,
    );
  });
}

/** Set cursor and disable text selection on document.body during a drag. */
export function setDragBodyState(cursor) {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = 'none';
}

/** Clear cursor and re-enable text selection on document.body after a drag. */
export function clearDragBodyState() {
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
  const up = () => {
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    clearDragBodyState();
    if (bodyClass) document.body.classList.remove(bodyClass);
    onDone();
  };
  setDragBodyState(cursor);
  if (bodyClass) document.body.classList.add(bodyClass);
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
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
