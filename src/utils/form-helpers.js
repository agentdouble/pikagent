/**
 * Inline form helpers — extracted from dom.js to reduce coupling.
 *
 * Provides utilities for inline <input> wiring and inline rename workflows.
 */

import { _el } from './dom.js';
import { onClickStopped } from './event-helpers.js';
import { setupKeyboardShortcuts } from './keyboard-helpers.js';

// Re-export _el so consumers that need both form helpers and _el can import
// from a single module instead of dom.js.
export { _el } from './dom.js';

/**
 * Wire up Enter / Escape / blur / click on an inline <input>.
 * Guarantees onCommit fires at most once.
 * @param {HTMLInputElement} input
 * @param {{ onCommit: (value: string) => void, onCancel?: () => void, blurDelay?: number }} opts
 */
export function setupInlineInput(input, { onCommit, onCancel, blurDelay = 0 }) {
  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    onCommit(input.value.trim());
  };
  const cancel = () => {
    committed = true;
    if (onCancel) onCancel();
    else input.remove();
  };

  setupKeyboardShortcuts(input, {
    onEnter: (e) => { e.preventDefault(); e.stopPropagation(); commit(); },
    onEscape: (e) => { e.stopPropagation(); cancel(); },
  });
  input.addEventListener('blur', () => {
    if (blurDelay > 0) setTimeout(() => { if (!committed) commit(); }, blurDelay);
    else if (!committed) commit();
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
