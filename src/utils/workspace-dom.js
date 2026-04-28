/**
 * DOM re-exports for the workspace domain.
 *
 * Workspace modules (workspace-layout, workspace-resize, sidebar-manager)
 * import _el through this facade instead of reaching into the core dom.js
 * hub directly.  This reduces dom.js fan-in.
 */
export { _el, renderList } from './dom.js';
