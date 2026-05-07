/**
 * Inline form helpers — extracted from dom.js to reduce coupling.
 *
 * Provides utilities for inline <input> wiring and inline rename workflows.
 */

import { _el } from './dom.js';
import { onClickStopped, onKeyAction } from './event-helpers.js';

/**
 * Create a <select> element from an array of option values.
 *
 * Each entry in `items` can be a string (used as both value and label)
 * or an `{ value, label, disabled, selected }` descriptor.
 *
 * @param {Array<string|{ value: string, label?: string, disabled?: boolean, selected?: boolean }>} items
 * @param {{ className?: string, selected?: string }} [opts]
 * @returns {HTMLSelectElement}
 */
export function buildSelect(items, { className, selected } = {}) {
  const select = _el('select', { className: className || '' });
  for (const item of items) {
    const isObj = typeof item === 'object';
    const val = isObj ? item.value : item;
    const label = isObj && item.label ? item.label : val;
    const opt = _el('option', { value: val, textContent: label });
    if (isObj && item.disabled) opt.disabled = true;
    if ((isObj && item.selected) || val === selected) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

/**
 * Create a guard that ensures `fn` is called at most once.
 * Subsequent calls are silently ignored.
 * @param {(...args: unknown[]) => void} fn
 * @returns {(...args: unknown[]) => void}
 */
function createOnceGuard(fn) {
  let called = false;
  return (...args) => { if (called) return; called = true; fn(...args); };
}

/**
 * Wire up Enter / Escape / blur / click on an inline <input>.
 * Guarantees onCommit fires at most once.
 * @param {HTMLInputElement} input
 * @param {{ onCommit: (value: string) => void, onCancel?: () => void, blurDelay?: number }} opts
 */
export function setupInlineInput(input, { onCommit, onCancel, blurDelay = 0 }) {
  const commit = createOnceGuard(() => onCommit(input.value.trim()));
  const cancel = createOnceGuard(() => {
    if (onCancel) onCancel();
    else input.remove();
  });

  onKeyAction(input, {
    onEnter: (e) => { e.preventDefault(); e.stopPropagation(); commit(); },
    onEscape: (e) => { e.stopPropagation(); cancel(); },
  });
  input.addEventListener('blur', () => {
    if (blurDelay > 0) setTimeout(() => commit(), blurDelay);
    else commit();
  });
  onClickStopped(input, () => {});
}

/**
 * Start an inline rename workflow: create an input, replace the target element,
 * focus + select, and wire up commit/cancel via setupInlineInput.
 *
 * @param {HTMLElement} targetEl - element to replace with the input
 * @param {{ className: string, value: string, selectRange?: [number, number],
 *           blurDelay?: number,
 *           replaceFn?: (targetEl: HTMLElement, input: HTMLInputElement) => void,
 *           restoreFn?: (targetEl: HTMLElement, input: HTMLInputElement) => void,
 *           onCommit: (value: string) => void,
 *           onCancel?: () => void }} opts
 * @returns {HTMLInputElement}
 */
export function startInlineRename(targetEl, { className, value, selectRange, blurDelay, replaceFn, restoreFn, onCommit, onCancel }) {
  const input = _el('input', { className, value });

  if (replaceFn) {
    replaceFn(targetEl, input);
  } else {
    targetEl.replaceWith(input);
  }

  input.focus();
  if (selectRange) {
    input.setSelectionRange(selectRange[0], selectRange[1]);
  } else {
    input.select();
  }

  const restore = restoreFn ? () => restoreFn(targetEl, input) : undefined;

  setupInlineInput(input, {
    blurDelay,
    onCommit: (val) => { if (restore) restore(); onCommit(val); },
    onCancel: () => { if (restore) restore(); if (onCancel) onCancel(); },
  });

  return input;
}
