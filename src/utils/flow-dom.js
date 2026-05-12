/**
 * DOM re-exports for the flow domain.
 *
 * Flow modules (flow-card-renderer, flow-card-setup, flow-modal-helpers,
 * flow-category-renderer) import DOM primitives through this facade instead
 * of reaching into the core dom.js hub directly.
 */
export { _el, createActionButton, renderButtonBar } from './dom.js';

import { renderPrefixedButtonBar } from './dom.js';

/**
 * Build a flow-domain button bar from a list of action definitions.
 * Each action's `cls` is prefixed with `baseClass` and `stopPropagation` is
 * forced to `true` — flow cards/categories sit inside clickable containers
 * so their buttons must stop event bubbling.
 *
 * Thin wrapper around the generic `renderPrefixedButtonBar` helper.
 *
 * @param {string} baseClass   - CSS class prefix for each button (e.g. "flow-card-btn")
 * @param {string} containerClass - CSS class for the bar container
 * @param {Array<{text: string, title: string, action: string, cls?: string}>} actions
 * @param {Record<string, () => void>} handlers
 * @returns {HTMLElement}
 */
export function buildDomainButtonBar(baseClass, containerClass, actions, handlers) {
  return renderPrefixedButtonBar({
    baseClass,
    containerClass,
    actions,
    handlers,
    stopPropagation: true,
  });
}
