/**
 * Workspace Ops Facade — groups workspace-related imports for consumers
 * that depend on workspace-layout, workspace-resize, and workspace-cleanup.
 *
 * Created for issue #323 to reduce coupling in tab-lifecycle.js.
 */

export { reattachLayout, syncFileTree } from './workspace-layout.js';
export { capturePanelWidths } from './workspace-resize.js';
export { disposeTab } from './workspace-cleanup.js';
