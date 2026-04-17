/**
 * Shared event listener helpers to reduce duplicated addEventListener patterns.
 *
 * Three utilities cover the most common patterns found across the codebase:
 *   - onClickStopped   : click + stopPropagation (+ optional preventDefault)
 *   - onKeyAction      : keydown with Enter / Escape dispatch
 *   - onDragEvents     : grouped dragstart / dragend / dragover / drop setup
 */

/**
 * Attach a click listener that always calls stopPropagation (and optionally
 * preventDefault) before invoking the handler.
 *
 * @param {HTMLElement} el
 * @param {(e: MouseEvent) => void} handler
 * @param {{ preventDefault?: boolean }} [opts]
 */
export function onClickStopped(el, handler, { preventDefault = false } = {}) {
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (preventDefault) e.preventDefault();
    handler(e);
  });
}

/**
 * Attach a keydown listener that dispatches Enter / Escape to the provided
 * callbacks. Returns a cleanup function that removes the listener.
 *
 * @param {HTMLElement} el
 * @param {{ onEnter?: (e: KeyboardEvent) => void, onEscape?: (e: KeyboardEvent) => void }} handlers
 * @returns {() => void} cleanup — removes the listener
 */
export function onKeyAction(el, { onEnter, onEscape } = {}) {
  const handler = (e) => {
    if (e.key === 'Enter' && onEnter) onEnter(e);
    if (e.key === 'Escape' && onEscape) onEscape(e);
  };
  el.addEventListener('keydown', handler);
  return () => el.removeEventListener('keydown', handler);
}

/**
 * Attach dragstart / dragend / dragover / dragleave / drop listeners to an
 * element in a single call. All callbacks are optional — omit any you don't need.
 *
 * @param {HTMLElement} el
 * @param {{ onDragStart?: (e: DragEvent) => void,
 *           onDragEnd?:   (e: DragEvent) => void,
 *           onDragOver?:  (e: DragEvent) => void,
 *           onDragLeave?: (e: DragEvent) => void,
 *           onDrop?:      (e: DragEvent) => void }} handlers
 */
export function onDragEvents(el, { onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop } = {}) {
  if (onDragStart) el.addEventListener('dragstart', onDragStart);
  if (onDragEnd)   el.addEventListener('dragend',   onDragEnd);
  if (onDragOver)  el.addEventListener('dragover',  onDragOver);
  if (onDragLeave) el.addEventListener('dragleave', onDragLeave);
  if (onDrop)      el.addEventListener('drop',      onDrop);
}
