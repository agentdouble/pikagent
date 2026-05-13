/**
 * Flow View Subsystem Facade — single entry-point for flow-view.js
 * to access helpers, category rendering, and card setup.
 *
 * Reduces the import surface of flow-view.js by consolidating
 * flow-view-helpers, flow-category-renderer, flow-card-setup,
 * dom, and form-helpers.
 *
 * Created for issue #384 to reduce coupling in flow-view.js.
 * Kept as-is per issue #462 — 3 active consumers (flow-view.js,
 * flow-view-rendering.js, flow-view-categories.js) rely on this facade
 * as their single import point for 5 source modules.
 *
 * @module flow-view-subsystem
 * @see https://github.com/agentdouble/pikagent/issues/462
 */

// ── flow-view-helpers ───────────────────────────────────────────────
export {
  EMPTY_LIST_MESSAGE, UNCATEGORIZED, HEADER_BUTTONS,
  getFlowsForCategory, getUncategorizedFlows,
  removeFlowFromOrder, moveFlowInOrder, deleteCategoryData,
} from './flow-view-helpers.js';

// ── flow-category-renderer ──────────────────────────────────────────
export { createCategoryGroup } from './flow-category-renderer.js';

// ── flow-card-setup ─────────────────────────────────────────────────
export { createFlowCard } from './flow-card-setup.js';

// ── dom (DOM primitives) ─────────────────────────────────────────────
export { _el, buildDomainButtonBar } from './dom.js';

// ── form-helpers (inline rename used by category management) ────────
export { startInlineRename } from './form-helpers.js';
