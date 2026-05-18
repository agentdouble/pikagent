/**
 * Dialog and prompt helpers.
 *
 * This module provides high-level dialog builders (prompt, confirm) and the
 * createModalOverlay primitive.  For core DOM primitives import from the
 * appropriate sub-module (dom-core, dom-buttons, dom-tabs, dom-lists).
 */

import { _el } from './dom-core.js';
import { createActionButton } from './dom-buttons.js';
import { onKeyAction } from './event-helpers.js';

/**
 * Create a modal overlay with click-outside-to-close behavior.
 * Returns { overlay, modal } DOM elements. Caller appends children to modal.
 *
 * @param {string} overlayClass
 * @param {string} modalClass
 * @param {() => void} onClose
 * @returns {{ overlay: HTMLElement, modal: HTMLElement }}
 */
export function createModalOverlay(overlayClass, modalClass, onClose) {
  const overlay = _el('div', overlayClass);
  const modal = _el('div', modalClass);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) onClose(); });
  return { overlay, modal };
}

/**
 * Build a dialog button row containing a cancel button followed by a confirm
 * button.  Extracts the cancel/confirm pair previously duplicated across
 * showPromptDialog, showConfirmDialog and the worktree dialog.
 *
 * @param {{ containerClass: string,
 *           confirmLabel?: string, cancelLabel?: string,
 *           confirmClass?: string, cancelClass?: string,
 *           onConfirm: () => void, onCancel: () => void }} opts
 * @returns {HTMLElement} the button-row container element
 */
export function buildDialogButtons({
  containerClass,
  confirmLabel = 'OK', cancelLabel = 'Cancel',
  confirmClass, cancelClass,
  onConfirm, onCancel,
}) {
  return _el('div', containerClass,
    createActionButton({ text: cancelLabel, cls: cancelClass, onClick: onCancel }),
    createActionButton({ text: confirmLabel, cls: confirmClass, onClick: onConfirm }),
  );
}

// ── Dialog lifecycle ──

/**
 * Reusable dialog lifecycle helper.
 * Creates overlay + modal via createModalOverlay, calls builder to populate
 * content, appends to document.body, and wraps everything in a Promise.
 *
 * @param {{ overlayClass: string, modalClass: string, cancelValue?: unknown, onCancel?: () => void, builder: (ctx: { overlay: HTMLElement, modal: HTMLElement, cleanup: (value: unknown) => void, cancel: () => void }) => (() => void) | void }} opts
 * @param {string} opts.overlayClass - CSS class for the overlay element
 * @param {string} opts.modalClass - CSS class for the modal element
 * @param {unknown} [opts.cancelValue=null] - value passed to resolve on cancel / click-outside
 * @param {() => void} [opts.onCancel] - optional callback fired after cancel cleanup
 * @param {(ctx: { overlay: HTMLElement, modal: HTMLElement, cleanup: (value: unknown) => void, cancel: () => void }) => (() => void) | void} opts.builder - receives ({ overlay, modal, cleanup, cancel }).
 *   cleanup(value) removes the overlay and resolves the promise.
 *   cancel() is a shorthand for cleanup(cancelValue) + onCancel?.().
 *   May return a function that runs after the overlay is appended to the DOM
 *   (useful for focusing elements).
 * @returns {Promise<unknown>}
 */
export function createDialogBase({ overlayClass, modalClass, cancelValue = null, onCancel, builder }) {
  return new Promise((resolve) => {
    let overlay;
    const cleanup = (value) => { overlay.remove(); resolve(value); };
    const cancel = () => { cleanup(cancelValue); onCancel?.(); };
    ({ overlay } = createModalOverlay(overlayClass, modalClass, cancel));
    const modal = overlay.firstChild;
    const afterMount = builder({ overlay, modal, cleanup, cancel });
    document.body.appendChild(overlay);
    if (typeof afterMount === 'function') afterMount();
  });
}

// ── Exported dialog builders ──

/**
 * Show a prompt dialog for a single text value.
 * @returns {Promise<string|null>} trimmed value or null if cancelled
 */
export function showPromptDialog({ title, placeholder = '', defaultValue = '', confirmLabel = 'Create', cancelLabel = 'Cancel' }) {
  return createDialogBase({
    overlayClass: 'prompt-dialog-overlay',
    modalClass: 'prompt-dialog-box',
    builder({ modal, cleanup, cancel }) {
      const confirm = () => { const v = input.value.trim(); cleanup(v || null); };
      const input = _el('input', { className: 'prompt-dialog-input', type: 'text', value: defaultValue, placeholder });
      onKeyAction(input, {
        onEnter: () => confirm(),
        onEscape: cancel,
      });
      modal.append(
        _el('label', 'prompt-dialog-label', title),
        input,
        buildDialogButtons({
          containerClass: 'prompt-dialog-btns',
          confirmLabel, cancelLabel,
          confirmClass: 'prompt-dialog-confirm', cancelClass: 'prompt-dialog-cancel',
          onConfirm: confirm, onCancel: cancel,
        }),
      );
      return () => {
        input.focus();
        if (defaultValue) input.select();
      };
    },
  });
}

/**
 * Shorthand for displaying a one-off error/info alert whose body is:
 *   <p>{prefix}<code>{error || 'unknown error'}</code></p>
 *
 * Used across several flows (worktree creation/removal, open-PR, etc.) where
 * the same pattern was previously copy-pasted.
 *
 * @param {string} prefix  Human-readable text before the code span.
 * @param {string|null|undefined} error  Machine-readable detail shown in <code>.
 * @returns {Promise<boolean>}
 */
export async function showErrorAlert(prefix, error) {
  return showConfirmDialog(
    _el('p', null, prefix, _el('code', null, error || 'unknown error')),
    { confirmLabel: 'OK', cancelLabel: 'Close' },
  );
}

/**
 * Show a confirm dialog.
 * @param {Node|string} message - text string or DOM node
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog(message, { confirmLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  return createDialogBase({
    overlayClass: 'confirm-overlay',
    modalClass: 'confirm-box',
    cancelValue: false,
    builder({ overlay, modal, cleanup, cancel }) {
      if (typeof message === 'string') modal.appendChild(_el('p', null, message));
      else modal.appendChild(message);

      const btnRow = buildDialogButtons({
        containerClass: 'confirm-buttons',
        confirmLabel, cancelLabel,
        confirmClass: 'confirm-ok', cancelClass: 'confirm-cancel',
        onConfirm: () => cleanup(true), onCancel: cancel,
      });
      modal.appendChild(btnRow);

      onKeyAction(overlay, {
        onEscape: cancel,
        onEnter: () => cleanup(true),
      });
      overlay.setAttribute('tabindex', '-1');
      return () => btnRow.querySelector('.confirm-ok').focus();
    },
  });
}

