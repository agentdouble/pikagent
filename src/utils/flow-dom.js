/**
 * DOM re-exports for the flow domain.
 *
 * Flow modules (flow-card-renderer, flow-card-setup, flow-modal-helpers,
 * flow-category-renderer) import DOM primitives through this facade instead
 * of reaching into the core dom.js hub directly.
 */
export { _el, createActionButton, renderButtonBar } from './dom.js';
