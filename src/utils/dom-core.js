/**
 * Core DOM primitives.
 *
 * These are the lowest-level helpers used by almost every UI module:
 *   _el  — element factory
 *   _vis — visibility toggle
 */

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
 * Toggle element visibility by setting display style.
 * @param {HTMLElement} el
 * @param {boolean} show
 * @param {string} [display=''] - Display value when visible (e.g. 'flex', 'block').
 */
export function _vis(el, show, display = '') {
  el.style.display = show ? display : 'none';
}
