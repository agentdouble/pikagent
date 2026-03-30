/**
 * Pure helpers and constants for flow-view.
 * No DOM — deterministic functions that can be tested in isolation.
 */

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

// --- Run time formatting ---

const TIME_LOCALE = 'fr-FR';
const TIME_FORMAT = { hour: '2-digit', minute: '2-digit' };

/**
 * Format a run timestamp into a short time string (e.g. "14:32").
 * Returns '' if timestamp is falsy.
 */
export function formatRunTime(timestamp) {
  return timestamp
    ? new Date(timestamp).toLocaleTimeString(TIME_LOCALE, TIME_FORMAT)
    : '';
}

/**
 * Build a "date time" label from a run's date and timestamp.
 * e.g. "2025-03-29 14:32" or just "2025-03-29" if no timestamp.
 */
export function formatRunDateTime(date, timestamp) {
  const time = formatRunTime(timestamp);
  return `${date}${time ? ' ' + time : ''}`;
}

/**
 * Build the tooltip text displayed on run-status dots.
 */
export function buildDotTooltip(run) {
  const label = STATUS_LABELS[run.status] || run.status;
  return `${formatRunDateTime(run.date, run.timestamp)} — ${label}\nCliquer pour voir le log`;
}

/**
 * Return flows belonging to a given category, ordered by catData.order.
 * @param {Array} flows - all flow objects
 * @param {Object} order - catData.order mapping catId → [flowId, …]
 * @param {string} catId - category id
 * @returns {Array} ordered flows for this category
 */
export function getFlowsForCategory(flows, order, catId) {
  const orderedIds = order[catId] || [];
  const flowMap = new Map(flows.map(f => [f.id, f]));
  return orderedIds.map(id => flowMap.get(id)).filter(Boolean);
}

/**
 * Return flows not assigned to any named category, respecting the
 * UNCATEGORIZED order when present, and appending any remaining flows.
 * @param {Array} flows - all flow objects
 * @param {Object} order - catData.order mapping catId → [flowId, …]
 * @returns {Array} ordered uncategorized flows
 */
export function getUncategorizedFlows(flows, order) {
  const assigned = new Set();
  for (const ids of Object.values(order)) {
    for (const id of ids) assigned.add(id);
  }
  const unordered = flows.filter(f => !assigned.has(f.id));
  const orderedIds = order[UNCATEGORIZED] || [];
  const flowMap = new Map(flows.map(f => [f.id, f]));
  const ordered = orderedIds.map(id => flowMap.get(id)).filter(Boolean);
  const inOrder = new Set(orderedIds);
  for (const f of unordered) {
    if (!inOrder.has(f.id)) ordered.push(f);
  }
  return ordered;
}

/**
 * Remove a flow id from every category array in order (in-place).
 * @param {Object} order - catData.order
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
 * @param {Object} order - catData.order
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
 * @param {Object} catData - { categories, order }
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

/**
 * Return the last run from a flow's runs array, or null if none.
 */
export function getLastRun(flow) {
  return flow.runs?.at(-1) ?? null;
}

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
