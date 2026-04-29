/**
 * DOM re-exports for the flow domain.
 *
 * Flow modules (flow-card-renderer, flow-card-setup, flow-modal-helpers,
 * flow-category-renderer) import DOM primitives through this facade instead
 * of reaching into the core dom.js hub directly.
 */
export { _el, createActionButton, renderButtonBar } from './dom.js';

import { renderButtonBar as _renderButtonBar } from './dom.js';

/**
 * Build a domain-specific button bar from a list of action definitions.
 * Each action's `cls` is prefixed with `baseClass` and `stopPropagation` is set
 * to true — the two repetitive steps previously duplicated across renderers.
 *
 * @param {string} baseClass   - CSS class prefix for each button (e.g. "flow-card-btn")
 * @param {string} containerClass - CSS class for the bar container
 * @param {Array<{text: string, title: string, action: string, cls?: string}>} actions
 * @param {Record<string, () => void>} handlers
 * @returns {HTMLElement}
 */
export function buildDomainButtonBar(baseClass, containerClass, actions, handlers) {
  const configs = actions.map(({ text, title, action, cls }) => ({
    text,
    title,
    cls: cls ? `${baseClass} ${cls}` : baseClass,
    action,
    stopPropagation: true,
  }));
  return _renderButtonBar({ containerClass, configs, handlers });
}
