/**
 * DOM re-exports for the terminal domain.
 *
 * Terminal-related modules (terminal-node-builder, terminal-drop-indicator,
 * terminal-panel-helpers) import _el through this facade instead of reaching
 * into the core dom.js hub directly.  This reduces dom.js fan-in.
 */
export { _el } from './dom.js';
