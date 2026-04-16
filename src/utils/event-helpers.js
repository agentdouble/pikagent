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
 * Attach dragstart / dragend / dragover / drop listeners to an element in a
 * single call. All callbacks are optional — omit any you don't need.
 *
 * @param {HTMLElement} el
 * @param {{ onDragStart?: (e: DragEvent) => void,
 *           onDragEnd?:   (e: DragEvent) => void,
 *           onDragOver?:  (e: DragEvent) => void,
 *           onDrop?:      (e: DragEvent) => void }} handlers
 */
export function onDragEvents(el, { onDragStart, onDragEnd, onDragOver, onDrop } = {}) {
  if (onDragStart) el.addEventListener('dragstart', onDragStart);
  if (onDragEnd)   el.addEventListener('dragend',   onDragEnd);
  if (onDragOver)  el.addEventListener('dragover',  onDragOver);
  if (onDrop)      el.addEventListener('drop',      onDrop);
}

/**
 * Wrap an async handler so it always stops event propagation, optionally
 * short-circuits when `guard()` returns falsy, and optionally invokes
 * `onSuccess()` after the async call resolves.
 *
 * Captures the canonical pattern:
 *   async (e) => { e.stopPropagation(); if (!guard) return; await fn(e); render(); }
 *
 * @param {(e: Event) => Promise<void>|void} asyncFn
 * @param {{ guard?: () => unknown, onSuccess?: () => void }} [opts]
 * @returns {(e: Event) => Promise<void>}
 */
export function asyncStopHandler(asyncFn, { guard, onSuccess } = {}) {
  return async (e) => {
    e.stopPropagation();
    if (guard && !guard()) return;
    await asyncFn(e);
    if (onSuccess) onSuccess();
  };
}

/**
 * Build a button per item, attach a click listener, and append into `container`.
 * Optionally toggles an `active` class via the `isActive` predicate.
 *
 * Captures the canonical loop pattern:
 *   for (const item of items) {
 *     const btn = makeBtn(item);
 *     if (isActive(item)) btn.classList.add('active');
 *     btn.addEventListener('click', e => handler(e, item));
 *     container.appendChild(btn);
 *   }
 *
 * @template T
 * @param {HTMLElement} container
 * @param {T[]} items
 * @param {{
 *   renderButton: (item: T) => HTMLElement,
 *   isActive?: (item: T) => boolean,
 *   onClick: (e: MouseEvent, item: T, btn: HTMLElement) => void,
 *   activeClass?: string,
 * }} opts
 */
export function appendListenerButtons(container, items, { renderButton, isActive, onClick, activeClass = 'active' }) {
  for (const item of items) {
    const btn = renderButton(item);
    if (isActive && isActive(item)) btn.classList.add(activeClass);
    btn.addEventListener('click', (e) => onClick(e, item, btn));
    container.appendChild(btn);
  }
}
