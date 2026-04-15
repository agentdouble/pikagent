import { onKeyAction } from './event-helpers.js';

/**
 * Lightweight DOM element factory.
 *
 * Supports two calling conventions:
 *   _el('div', { className: 'c', textContent: 't', onClick: fn }, child…)  — object attrs
 *   _el('div', 'className', 'text' | { prop: v } | child…)               — positional
 *
 * @param {string} tag
 * @param {Record<string, unknown>|string|null} [attrsOrClass]
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
 * Unified factory that accepts both legacy (`label`, `className`) and
 * short-form (`text`, `cls`) parameter names so every call-site can
 * converge on a single helper.
 *
 * Supports text labels, child nodes (e.g. SVG icons), and optional
 * stopPropagation wrapping on the click handler.
 *
 * @param {{ text?: string, label?: string, title?: string,
 *           cls?: string, className?: string,
 *           onClick?: (e: MouseEvent) => void, childNode?: Node,
 *           stopPropagation?: boolean }} opts
 * @returns {HTMLButtonElement}
 */
export function createActionButton({ text, label = '', title, cls, className, onClick, childNode, stopPropagation = false } = {}) {
  const content = text ?? label;
  const cssClass = cls ?? className ?? '';
  const btn = _el('button', cssClass, content);
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
 * (text, label, title, className, childNode, stopPropagation) plus an
 * `action` key that maps into the `handlers` object.
 *
 * @param {{ containerClass: string,
 *           configs: Array<{ action: string, text?: string, label?: string,
 *                            title?: string, cls?: string, className?: string,
 *                            childNode?: Node, stopPropagation?: boolean }>,
 *           handlers: Record<string, (e: MouseEvent) => void> }} opts
 * @returns {HTMLElement}
 */
export function renderButtonBar({ containerClass, configs, handlers }) {
  const bar = _el('div', containerClass);
  for (const cfg of configs) {
    bar.appendChild(createActionButton({
      text: cfg.text || cfg.label || '',
      title: cfg.title,
      cls: cfg.className || cfg.cls,
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
 * Delegates to onKeyAction from event-helpers.
 * @param {HTMLElement} el
 * @param {{ onEnter?: (e: KeyboardEvent) => void, onEscape?: (e: KeyboardEvent) => void }} handlers
 * @returns {() => void} cleanup — removes the listener
 */
export function setupKeyboardShortcuts(el, { onEnter, onEscape } = {}) {
  return onKeyAction(el, { onEnter, onEscape });
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
 * Wire up dragover / dragleave / drop on an element.
 *
 * @param {HTMLElement} el
 * @param {{ hoverClass?: string,
 *           onDrop: (e: DragEvent) => void,
 *           onDragOver?: (e: DragEvent) => void,
 *           onDragLeave?: (e: DragEvent) => void,
 *           accept?: (e: DragEvent) => boolean }} opts
 */
export function setupDropZone(el, { hoverClass = 'drag-over', onDrop, onDragOver, onDragLeave, accept }) {
  el.addEventListener('dragover', (e) => {
    if (accept && !accept(e)) return;
    e.preventDefault();
    el.classList.add(hoverClass);
    if (onDragOver) onDragOver(e);
  });
  el.addEventListener('dragleave', (e) => {
    if (onDragLeave) {
      onDragLeave(e);
    } else {
      el.classList.remove(hoverClass);
    }
  });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove(hoverClass);
    onDrop(e);
  });
}