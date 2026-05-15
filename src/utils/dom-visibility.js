/**
 * DOM visibility utilities.
 *
 * Extracted from dom.js (issue #541) — contains visibility helpers:
 *   _vis
 */

/**
 * Toggle element visibility by setting display style.
 * @param {HTMLElement} el
 * @param {boolean} show
 * @param {string} [display=''] - Display value when visible (e.g. 'flex', 'block').
 */
export function _vis(el, show, display = '') {
  el.style.display = show ? display : 'none';
}
