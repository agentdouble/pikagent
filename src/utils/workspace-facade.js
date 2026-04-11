/**
 * Workspace Facade — re-exports workspace utilities used by tab-manager.js.
 *
 * This module exists solely to reduce the number of direct imports in
 * tab-manager.js (issue #130).  It contains NO logic of its own.
 *
 * Other consumers should continue importing from the original modules.
 */

export { renderWorkspace, reattachLayout } from './workspace-layout.js';
export { capturePanelWidths } from './workspace-resize.js';
export { disposeAllTabs } from './workspace-cleanup.js';
export { serialize, restoreConfig } from './workspace-serializer.js';
