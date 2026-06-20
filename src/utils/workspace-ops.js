/**
 * Workspace Ops Facade — groups workspace-related imports for consumers
 * that depend on workspace-layout, workspace-resize, workspace-cleanup,
 * and workspace-serializer.
 *
 * Created for issue #323 to reduce coupling in tab-lifecycle.js.
 * Extended for issue #384 to reduce coupling in tab-manager.js.
 */

// ── workspace-layout ────────────────────────────────────────────────
export { renderWorkspace, reattachLayout, syncFileTree } from './workspace-layout.js';

// ── workspace-resize ────────────────────────────────────────────────
export { capturePanelWidths } from './workspace-resize.js';

// ── workspace-cleanup ───────────────────────────────────────────────
export { disposeTab, disposeAllTabs } from './workspace-cleanup.js';

// ── workspace-serializer ────────────────────────────────────────────
export { serialize, restoreConfig } from './workspace-serializer.js';
