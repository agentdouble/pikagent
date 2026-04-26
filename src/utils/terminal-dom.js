/**
 * DOM re-exports for the terminal domain.
 *
 * Terminal-related modules (terminal-node-builder, terminal-drop-indicator,
 * terminal-panel-helpers, board-view) import DOM primitives through this facade
 * instead of reaching into the core dom.js hub directly.
 */
export { _el, renderButtonBar } from './dom.js';
