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
 *
 * Supports text labels, child nodes (e.g. SVG icons), and optional
 * stopPropagation wrapping on the click handler.
 *
 * @param {{ label?: string, title?: string, className?: string,
 *           onClick?: (e: MouseEvent) => void, childNode?: Node,
 *           stopPropagation?: boolean }} opts
 * @returns {HTMLButtonElement}
 */
export function createButton({ label = '', title, className, onClick, childNode, stopPropagation = false } = {}) {
  const btn = _el('button', className || '', label);
  if (title) btn.title = title;
  if (childNode) btn.appendChild(childNode);
  if (onClick) {
    btn.addEventListener('click', stopPropagation
      ? (e) => { e.stopPropagation(); onClick(e); }
      : onClick);
  }
  return btn;
}

/**
 * Render a row of buttons from an array of config descriptors.
 *
 * Each entry in `configs` is an object with button properties
 * (label, title, className, childNode, stopPropagation) plus an
 * `action` key that maps into the `handlers` object.
 *
 * @param {{ containerClass: string,
 *           configs: Array<{ action: string, label?: string, title?: string,
 *                            className?: string, childNode?: Node,
 *                            stopPropagation?: boolean }>,
 *           handlers: Record<string, (e: MouseEvent) => void> }} opts
 * @returns {HTMLElement}
 */
export function renderButtonBar({ containerClass, configs, handlers }) {
  const bar = _el('div', containerClass);
  for (const cfg of configs) {
    bar.appendChild(createButton({
      label: cfg.label || cfg.icon || cfg.text || '',
      title: cfg.title,
      className: cfg.className || cfg.cls,
      childNode: cfg.childNode,
      stopPropagation: cfg.stopPropagation ?? false,
      onClick: handlers[cfg.action],
    }));
  }
  return bar;
}

/**
 * Create a <select> element from an options map.
 * @param {{ options: Record<string, string>, value?: string, className?: string, onChange?: (e: Event) => void }} opts
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
 * @param {{ onEnter?: (e: KeyboardEvent) => void, onEscape?: (e: KeyboardEvent) => void }} handlers
 * @returns {() => void} cleanup — removes the listener
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
 * Private dialog lifecycle helper.
 * Creates overlay + modal via createModalOverlay, calls builder to populate
 * content, appends to document.body, and wraps everything in a Promise.
 *
 * @param {Object} opts
 * @param {string} opts.overlayClass - CSS class for the overlay element
 * @param {string} opts.modalClass - CSS class for the modal element
 * @param {*} [opts.cancelValue=null] - value passed to resolve on cancel / click-outside
 * @param {Function} [opts.onCancel] - optional callback fired after cancel cleanup
 * @param {Function} opts.builder - receives ({ overlay, modal, cleanup, cancel }).
 *   cleanup(value) removes the overlay and resolves the promise.
 *   cancel() is a shorthand for cleanup(cancelValue) + onCancel?.().
 *   May return a function that runs after the overlay is appended to the DOM
 *   (useful for focusing elements).
 * @returns {Promise}
 */
function createDialogBase({ overlayClass, modalClass, cancelValue = null, onCancel, builder }) {
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

/**
 * High-level modal builder: creates overlay + modal with a title bar,
 * content area, and optional close button. Appends to document.body.
 *
 * @param {{ title?: string, content?: Node|Node[], onClose: () => void,
 *           overlayClass?: string, modalClass?: string }} opts
 * @returns {{ overlay: HTMLElement, modal: HTMLElement, body: HTMLElement, close: () => void }}
 */
export function createCustomModal({ title, content, onClose, overlayClass = 'modal-overlay', modalClass = 'modal' } = {}) {
  let _overlay, _modal, _body, _close;
  createDialogBase({
    overlayClass,
    modalClass,
    onCancel: onClose,
    builder({ overlay, modal, cancel }) {
      _close = cancel;
      if (title) {
        const header = _el('div', `${modalClass}-header`,
          _el('span', `${modalClass}-title`, title),
          createButton({ label: '\u00D7', className: `${modalClass}-close-btn`, onClick: cancel }),
        );
        modal.appendChild(header);
      }
      _body = _el('div', `${modalClass}-body`);
      if (content) {
        const nodes = Array.isArray(content) ? content : [content];
        for (const node of nodes) {
          if (node) _body.appendChild(node);
        }
      }
      modal.appendChild(_body);
      setupKeyboardShortcuts(overlay, { onEscape: cancel });
      _overlay = overlay;
      _modal = modal;
    },
  });
  return { overlay: _overlay, modal: _modal, body: _body, close: _close };
}

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
          createButton({ label: cancelLabel, className: 'prompt-dialog-cancel', onClick: cancel }),
          createButton({ label: confirmLabel, className: 'prompt-dialog-confirm', onClick: confirm }),
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
 * Build a row containing a chevron span and a name span.
 *
 * Used by file-tree rows and flow-category headers — any place that needs
 * the common "chevron + label" pattern.
 *
 * @param {{ chevronClass: string, nameClass: string, name: string, chevronText?: string }} opts
 * @returns {{ chevron: HTMLElement, name: HTMLElement }}
 */
export function buildChevronRow(opts) {
  const chevron = _el('span', { className: opts.chevronClass, textContent: opts.chevronText || '' });
  const name = _el('span', { className: opts.nameClass, textContent: opts.name });
  return { chevron, name };
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
  return createDialogBase({
    overlayClass: 'confirm-overlay',
    modalClass: 'confirm-box',
    cancelValue: false,
    builder({ overlay, modal, cleanup, cancel }) {
      if (typeof message === 'string') modal.appendChild(_el('p', null, message));
      else modal.appendChild(message);

      const btnRow = _el('div', 'confirm-buttons',
        createButton({ label: cancelLabel, className: 'confirm-cancel', onClick: cancel }),
        createButton({ label: confirmLabel, className: 'confirm-ok', onClick: () => cleanup(true) }),
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
