/**
 * Consolidated DOM re-exports for all domains.
 *
 * Replaces the individual per-domain facade files (workspace-dom.js,
 * settings-dom.js, file-dom.js, tab-dom.js, terminal-dom.js, git-dom.js).
 *
 * Every consumer imports the exact symbols it needs from this single module;
 * tree-shaking ensures only the used helpers are bundled.
 *
 * Consumers:
 *   workspace  — workspace-layout, workspace-resize, sidebar-manager, usage-view
 *   settings   — settings-modal, settings-appearance, settings-configs,
 *                settings-keybindings, settings-update, settings-section-builder
 *   git        — worktree-flow, worktree-dialog, open-pr-flow
 *   file       — file-editor-renderer, file-viewer-tabs, file-viewer-mode-bar,
 *                file-tree-drop, file-tree-renderer, file-tree-section-dom
 *   tab        — tab-bar-renderer, tab-renderer, tab-lifecycle, tab-color-filter
 *   terminal   — terminal-panel-helpers, terminal-node-builder, terminal-drop-indicator
 *
 * @see https://github.com/agentdouble/pikagent/issues/462
 */

export { _el, _vis, createActionButton, renderButtonBar, buildDomainButtonBar, renderList } from './dom.js';
