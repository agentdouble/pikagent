/**
 * Pure helpers and constants for flow-view.
 * No DOM — deterministic functions that can be tested in isolation.
 */

import { formatDateTime } from './date-utils.js';
import { getLastRun } from '../../shared/flow-utils.js';

export const FIT_DELAY_MS = 50;
export const LOG_SCROLLBACK = 50000;
export const LIVE_SCROLLBACK = 10000;

export const STATUS_LABELS = { success: 'Succès', error: 'Erreur' };
export const NO_LOG_MESSAGE = '\r\n  Log non disponible pour ce run.\r\n';
export const NO_LOG_MODAL_MESSAGE = '\r\n  Log non disponible.\r\n';
export const EMPTY_LIST_MESSAGE = 'Aucun flow. Créez-en un pour automatiser vos tâches.';
export const MAX_VISIBLE_RUNS = 5;
export const UNCATEGORIZED = '_uncategorized';

// --- Header button configuration ---
export const HEADER_BUTTONS = [
  { label: '+ Catégorie', action: 'addCategory' },
  { label: '+ Nouveau', action: 'addFlow' },
];

// --- Category action button configuration ---
export const CATEGORY_ACTIONS = [
  { icon: '✎', title: 'Renommer', action: 'rename' },
  { icon: '✕', title: 'Supprimer la catégorie', cls: 'flow-category-btn-danger', action: 'delete' },
];

// --- Run time formatting (delegated to shared date-utils) ---

/** @see formatDateTime from date-utils */
export const formatRunDateTime = formatDateTime;

/**
 * Build the tooltip text displayed on run-status dots.
 */
export function buildDotTooltip(run) {
  const label = STATUS_LABELS[run.status] || run.status;
  return `${formatRunDateTime(run.date, run.timestamp)} — ${label}\nCliquer pour voir le log`;
}

/**
 * Build a Map keyed by flow.id for fast lookup.
 * @param {Array} flows
 * @returns {Map<string, Object>}
 */
function buildFlowMap(flows) {
  return new Map(flows.map(f => [f.id, f]));
}

/**
 * Resolve an array of flow IDs to flow objects using a flow map.
 * @param {string[]} ids
 * @param {Map<string, Object>} flowMap
 * @returns {Array}
 */
function resolveIds(ids, flowMap) {
  return ids.map(id => flowMap.get(id)).filter(Boolean);
}

/**
 * Return flows belonging to a given category, ordered by catData.order.
 * @param {Array} flows - all flow objects
 * @param {Record<string, string[]>} order - catData.order mapping catId → [flowId, …]
 * @param {string} catId - category id
 * @returns {Array} ordered flows for this category
 */
export function getFlowsForCategory(flows, order, catId) {
  return resolveIds(order[catId] || [], buildFlowMap(flows));
}

/**
 * Return flows not assigned to any named category, respecting the
 * UNCATEGORIZED order when present, and appending any remaining flows.
 * @param {Array} flows - all flow objects
 * @param {Record<string, string[]>} order - catData.order mapping catId → [flowId, …]
 * @returns {Array} ordered uncategorized flows
 */
export function getUncategorizedFlows(flows, order) {
  const assigned = new Set();
  for (const ids of Object.values(order)) {
    for (const id of ids) assigned.add(id);
  }

  const flowMap = buildFlowMap(flows);
  const orderedIds = order[UNCATEGORIZED] || [];
  const ordered = resolveIds(orderedIds, flowMap);
  const inOrder = new Set(orderedIds);

  for (const f of flows) {
    if (!assigned.has(f.id) && !inOrder.has(f.id)) ordered.push(f);
  }
  return ordered;
}

/**
 * Remove a flow id from every category array in order (in-place).
 * @param {Record<string, string[]>} order - catData.order
 * @param {string} flowId
 */
export function removeFlowFromOrder(order, flowId) {
  for (const key of Object.keys(order)) {
    order[key] = order[key].filter(id => id !== flowId);
  }
}

/**
 * Move a flow into a target category at the given position (in-place).
 * Removes the flow from all categories first, then inserts it.
 * @param {Record<string, string[]>} order - catData.order
 * @param {string} flowId
 * @param {string} targetCatId
 * @param {number} [insertIndex=-1] - position to insert (-1 = append)
 */
export function moveFlowInOrder(order, flowId, targetCatId, insertIndex = -1) {
  removeFlowFromOrder(order, flowId);
  if (!order[targetCatId]) order[targetCatId] = [];
  const arr = order[targetCatId];
  if (insertIndex >= 0 && insertIndex < arr.length) {
    arr.splice(insertIndex, 0, flowId);
  } else {
    arr.push(flowId);
  }
}

/**
 * Delete a category: move its flows to UNCATEGORIZED, then remove it (in-place).
 * @param {{ categories: Array<{ id: string, name: string }>, order: Record<string, string[]> }} catData
 * @param {string} catId
 * @returns {boolean} true if category was found and removed
 */
export function deleteCategoryData(catData, catId) {
  const cat = catData.categories.find(c => c.id === catId);
  if (!cat) return false;

  const flowIds = catData.order[catId] || [];
  if (!catData.order[UNCATEGORIZED]) catData.order[UNCATEGORIZED] = [];
  catData.order[UNCATEGORIZED].push(...flowIds);

  catData.categories = catData.categories.filter(c => c.id !== catId);
  delete catData.order[catId];
  return true;
}

// getLastRun imported from shared/flow-utils.js and re-exported
export { getLastRun };

/**
 * Build the list of card action descriptors for a given flow state.
 * Each entry: { icon, title, action, cls? }
 * Pure function — no DOM, no side effects.
 */
export function buildCardActionEntries(flow, isRunning) {
  return [
    !isRunning && { icon: '▶', title: 'Exécuter maintenant', action: 'run' },
    {
      icon: flow.enabled ? '⏸' : '⏵',
      title: flow.enabled ? 'Désactiver' : 'Activer',
      action: 'toggle',
    },
    { icon: '✎', title: 'Modifier', action: 'edit' },
    { icon: '✕', title: 'Supprimer', action: 'delete', cls: 'flow-card-btn-danger' },
  ].filter(Boolean);
}
