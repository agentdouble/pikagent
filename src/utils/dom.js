/**
 * Core DOM utilities.
 *
 * This module keeps only the essential DOM factories:
 *   _el, createActionButton, renderButtonBar, buildChevronRow
 *
 * The following helpers have been extracted to dedicated modules — import
 * them directly from there instead of going through this file:
 *   - createModalOverlay, createCustomModal,
 *     showPromptDialog, showConfirmDialog   → ./dom-dialogs.js
 *   - setupInlineInput, startInlineRename   → ./form-helpers.js
 *   - setupDropZone                         → ./drop-zone-helpers.js
 *   - setupKeyboardShortcuts                → ./keyboard-helpers.js
 *   - _safeFit                              → ./terminal-factory.js
 *   - createSelect                          → ./flow-modal-helpers.js
 *   - positionInViewport                    → ./context-menu.js (private)
 */
import { onClickStopped } from './event-helpers.js';

/**
 * Create a DOM element.
 *
 * Supports two calling conventions:
 *   _el('div', { className: 'c', textContent: 't', onClick: fn }, child…)  — object attrs
 *   _el('div', 'className', 'text' | { prop: v } | child…)               — positional
 *
 * @param {string} tag
 * @param {Record<string, unknown>|string|null} [attrsOrClass]
 * @param {...(Node|string|Record<string, unknown>|null|false)} children
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
    if (stopPropagation) onClickStopped(btn, onClick);
    else btn.addEventListener('click', onClick);
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


