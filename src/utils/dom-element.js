/**
 * DOM element creation utilities.
 *
 * Extracted from dom.js (issue #541) — contains core element factories:
 *   _el, createActionButton
 */
import { onClickStopped } from './event-helpers.js';

/**
 * Create a DOM element.
 *
 * Supports two calling conventions:
 *   _el('div', { className: 'c', textContent: 't', onClick: fn }, child...)  -- object attrs
 *   _el('div', 'className', 'text' | { prop: v } | child...)               -- positional
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
