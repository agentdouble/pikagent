/**
 * Consolidated DOM re-exports for all domains.
 *
 * Replaces the individual per-domain facade files (workspace-dom.js,
 * settings-dom.js, file-dom.js, tab-dom.js, terminal-dom.js, git-dom.js).
 *
 * Every consumer imports the exact symbols it needs from this single module;
 * tree-shaking ensures only the used helpers are bundled.
 */

// ── workspace domain ────────────────────────────────────────────────
// workspace-layout, workspace-resize, sidebar-manager, usage-view, …
export { _el, renderList } from './dom.js';

// ── settings domain ─────────────────────────────────────────────────
// settings-modal, settings-appearance, settings-configs,
// settings-keybindings, settings-update, settings-section-builder
export { createActionButton, renderButtonBar, renderPrefixedButtonBar } from './dom.js';

// ── git domain ──────────────────────────────────────────────────────
// worktree-flow, worktree-dialog, open-pr-flow
export { _vis } from './dom.js';
// (also uses _el, createActionButton — already exported above)
