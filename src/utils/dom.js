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

/** Safely call fitAddon.fit(), swallowing errors from detached terminals. */
export function _safeFit(fitAddon) {
  try { fitAddon.fit(); } catch {}
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
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') close(null);
    });

    const box = _el('div', 'prompt-dialog-box',
      _el('label', 'prompt-dialog-label', title),
      input,
      _el('div', 'prompt-dialog-btns',
        _el('button', { className: 'prompt-dialog-cancel', textContent: cancelLabel, onClick: () => close(null) }),
        _el('button', { className: 'prompt-dialog-confirm', textContent: confirmLabel, onClick: confirm }),
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
      _el('button', { className: 'confirm-cancel', textContent: cancelLabel, onClick: () => cleanup(false) }),
      _el('button', { className: 'confirm-ok', textContent: confirmLabel, onClick: () => cleanup(true) }),
    );
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
    btnRow.querySelector('.confirm-ok').focus();
  });
}
