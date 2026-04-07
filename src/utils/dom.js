/**
 * Lightweight DOM element factory.
 *
 * Supports two calling conventions:
 *   _el('div', { className: 'c', textContent: 't', onClick: fn }, child…)  — object attrs
 *   _el('div', 'className', 'text' | { prop: v } | child…)               — positional
 *
 * @param {string} tag
 * @param {Object|string|null} [attrsOrClass]
 * @param {...(Node|string|Object|null|false)} children
 */
export function _el(tag, attrsOrClass, ...children) {
  const el = document.createElement(tag);
  if (typeof attrsOrClass === 'string') {
    if (attrsOrClass) el.className = attrsOrClass;
  } else if (attrsOrClass) {
    for (const [k, v] of Object.entries(attrsOrClass)) {
      if (k === 'className') el.className = v;
      else if (k === 'textContent') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el[k] = v;
    }
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child && typeof child === 'object' && !(child instanceof Node)) Object.assign(el, child);
    else if (child) el.appendChild(child);
  }
  return el;
}

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
  input.addEventListener('click', (e) => e.stopPropagation());
}

/**
 * Create a <button> element with common options.
 * @param {{ label?: string, title?: string, className?: string, onClick?: Function }} opts
 * @returns {HTMLButtonElement}
 */
export function createButton({ label = '', title, className, onClick } = {}) {
  const btn = _el('button', className || '', label);
  if (title) btn.title = title;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Create a <select> element from an options map.
 * @param {{ options: Object<string, string>, value?: string, className?: string, onChange?: Function }} opts
 * @returns {HTMLSelectElement}
 */
export function createSelect({ options, value, className, onChange } = {}) {
  const select = _el('select', { className: className || '' });
  for (const [val, label] of Object.entries(options)) {
    select.appendChild(_el('option', { value: val, textContent: label }));
  }
  if (value !== undefined) select.value = value;
  if (onChange) select.addEventListener('change', onChange);
  return select;
}

/**
 * Wire up Enter / Escape keyboard shortcuts on an element.
 * @param {HTMLElement} el
 * @param {{ onEnter?: Function, onEscape?: Function }} handlers
 * @returns {Function} cleanup — removes the listener
 */
export function setupKeyboardShortcuts(el, { onEnter, onEscape } = {}) {
  const handler = (e) => {
    if (e.key === 'Enter' && onEnter) { onEnter(e); }
    if (e.key === 'Escape' && onEscape) { onEscape(e); }
  };
  el.addEventListener('keydown', handler);
  return () => el.removeEventListener('keydown', handler);
}

/** Safely call fitAddon.fit(), swallowing errors from detached terminals. */
export function _safeFit(fitAddon) {
  try { fitAddon.fit(); } catch {}
}

/**
 * Create a modal overlay with click-outside-to-close behavior.
 * Returns { overlay, modal } DOM elements. Caller appends children to modal.
 */
export function createModalOverlay(overlayClass, modalClass, onClose) {
  const overlay = _el('div', overlayClass);
  const modal = _el('div', modalClass);
  overlay.appendChild(modal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) onClose(); });
  return { overlay, modal };
}

/**
 * Show a prompt dialog for a single text value.
 * @returns {Promise<string|null>} trimmed value or null if cancelled
 */
export function showPromptDialog({ title, placeholder = '', defaultValue = '', confirmLabel = 'Create', cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const overlay = _el('div', 'prompt-dialog-overlay');
    const close = (val) => { overlay.remove(); resolve(val); };
    const confirm = () => { const v = input.value.trim(); close(v || null); };

    const input = _el('input', { className: 'prompt-dialog-input', type: 'text', value: defaultValue, placeholder });
    setupKeyboardShortcuts(input, {
      onEnter: () => confirm(),
      onEscape: () => close(null),
    });

    const box = _el('div', 'prompt-dialog-box',
      _el('label', 'prompt-dialog-label', title),
      input,
      _el('div', 'prompt-dialog-btns',
        createButton({ label: cancelLabel, className: 'prompt-dialog-cancel', onClick: () => close(null) }),
        createButton({ label: confirmLabel, className: 'prompt-dialog-confirm', onClick: confirm }),
      ),
    );

    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    input.focus();
    if (defaultValue) input.select();
  });
}

/**
 * Clamp (x, y) so a box of (width, height) stays within the viewport.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} [padding=8]
 * @returns {{ left: number, top: number }}
 */
export function positionInViewport(x, y, width, height, padding = 8) {
  return {
    left: Math.min(x, window.innerWidth  - width  - padding),
    top:  Math.min(y, window.innerHeight - height - padding),
  };
}

/**
 * Show a confirm dialog.
 * @param {Node|string} message - text string or DOM node
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog(message, { confirmLabel = 'OK', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const overlay = _el('div', 'confirm-overlay');
    const box = _el('div', 'confirm-box');

    if (typeof message === 'string') box.appendChild(_el('p', null, message));
    else box.appendChild(message);

    const btnRow = _el('div', 'confirm-buttons',
      createButton({ label: cancelLabel, className: 'confirm-cancel', onClick: () => cleanup(false) }),
      createButton({ label: confirmLabel, className: 'confirm-ok', onClick: () => cleanup(true) }),
    );
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    btnRow.querySelector('.confirm-ok').focus();
  });
}
