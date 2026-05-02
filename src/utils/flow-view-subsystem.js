/**
 * Flow View Subsystem Facade — single entry-point for flow-view.js
 * to access helpers, category rendering, and card setup.
 *
 * Reduces the import surface of flow-view.js by consolidating
 * flow-view-helpers, flow-category-renderer, and flow-card-setup.
 *
 * Created for issue #384 to reduce coupling in flow-view.js.
 *
 * @module flow-view-subsystem
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
