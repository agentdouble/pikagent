/**
 * Dialog and prompt helpers — extracted from dom.js to reduce file length.
 *
 * This module provides high-level dialog builders (prompt, confirm) and the
 * createModalOverlay primitive.  For core DOM primitives (_el, createActionButton, renderButtonBar,
 * buildChevronRow, etc.) import directly from './dom.js'.
 */

import { _el, createActionButton } from './dom.js';
import { setupKeyboardShortcuts } from './keyboard-helpers.js';

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
      setupKeyboardShortcuts(input, {
        onEnter: () => confirm(),
        onEscape: cancel,
      });
      modal.append(
        _el('label', 'prompt-dialog-label', title),
        input,
        _el('div', 'prompt-dialog-btns',
          createActionButton({ text: cancelLabel, cls: 'prompt-dialog-cancel', onClick: cancel }),
          createActionButton({ text: confirmLabel, cls: 'prompt-dialog-confirm', onClick: confirm }),
        ),
      );
      return () => {
        input.focus();
        if (defaultValue) input.select();
      };
    },
  });
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

      const btnRow = _el('div', 'confirm-buttons',
        createActionButton({ text: cancelLabel, cls: 'confirm-cancel', onClick: cancel }),
        createActionButton({ text: confirmLabel, cls: 'confirm-ok', onClick: () => cleanup(true) }),
      );
      modal.appendChild(btnRow);

      setupKeyboardShortcuts(overlay, {
        onEscape: cancel,
        onEnter: () => cleanup(true),
      });
      overlay.setAttribute('tabindex', '-1');
      return () => btnRow.querySelector('.confirm-ok').focus();
    },
  });
}

/**
 * Show a simple error alert with a prefix message and an error value in a <code> block.
 * Factorises the common pattern found in worktree and PR flows.
 *
 * @param {string} prefix - human-readable context, e.g. "Push failed: "
 * @param {string|null|undefined} error - error detail shown inside <code>
 * @returns {Promise<boolean>}
 */
export async function showErrorAlert(prefix, error) {
  return showConfirmDialog(
    _el('p', null, prefix, _el('code', null, error || 'unknown error')),
    { confirmLabel: 'OK', cancelLabel: 'Close' },
  );
}
