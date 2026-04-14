/**
 * Shared mouse-drag utility — single source of truth for cursor management,
 * selection prevention, body class toggling, RAF throttling, and cleanup.
 *
 * Pure DOM helper — no component dependencies.
 */

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
 */
export function trackMouse(cursor, onMove, onDone) {
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
    document.body.classList.remove('resizing');
    onDone();
  };
  setDragBodyState(cursor);
  document.body.classList.add('resizing');
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
}
