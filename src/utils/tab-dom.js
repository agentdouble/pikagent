/**
 * DOM re-exports for the tab domain.
 *
 * Tab-related modules (tab-bar-renderer, tab-renderer, tab-color-filter,
 * tab-lifecycle) import _el through this facade instead of reaching into
 * the core dom.js hub directly.  This reduces dom.js fan-in.
 */
export { _el } from './dom.js';
