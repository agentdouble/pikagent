/**
 * FlowView rendering helpers — extracted from FlowView component.
 *
 * Pure orchestration functions for building the list of flow categories
 * and cards. State is passed in, never owned here.
 */

import {
  EMPTY_LIST_MESSAGE, UNCATEGORIZED, HEADER_BUTTONS,
  getFlowsForCategory, getUncategorizedFlows,
  removeFlowFromOrder,
  createCategoryGroup, createFlowCard,
  _el, renderButtonBar,
} from './flow-view-subsystem.js';

/**
 * Build the outer shell DOM for the FlowView (wrapper + header + listEl).
 * @param {HTMLElement} container
 * @param {{ onAddCategory: () => void, onAddFlow: () => void }} handlers
 * @returns {{ listEl: HTMLElement }}
 */
export function renderFlowViewShell(container, handlers) {
  container.replaceChildren();
  const wrapper = _el('div', 'flow-container');
  const header = _el('div', 'flow-header');
  header.appendChild(_el('h2', 'flow-title', 'Flows'));

  const headerHandlers = { addCategory: handlers.onAddCategory, addFlow: handlers.onAddFlow };
  const configs = HEADER_BUTTONS.map(({ label, action }) => ({ label, cls: 'flow-add-btn', action }));
  const headerRight = renderButtonBar({ containerClass: 'flow-header-right', configs, handlers: headerHandlers });
  headerRight.style.display = 'flex';
  headerRight.style.gap = '8px';

  header.appendChild(headerRight);
  wrapper.appendChild(header);
  const listEl = _el('div', 'flow-list');
  wrapper.appendChild(listEl);
  container.appendChild(wrapper);
  return { listEl };
}

/**
 * Build the shared groupParams object for a category section.
 * @param {{ cat: object, flows: Array, isUncat: boolean, collapsedCategories: Set<string>, createCard: Function, onToggleCollapse: Function, onRenameCategory: Function, onDeleteCategory: Function, onDropFlow: Function, dragState: object }} opts
 */
export function buildGroupParams(opts) {
  const { cat, flows, isUncat, collapsedCategories, createCard, onToggleCollapse, onRenameCategory, onDeleteCategory, onDropFlow, dragState } = opts;
  return {
    cat,
    flows,
    isUncategorized: isUncat,
    collapsedCategories,
    createCard,
    onToggleCollapse,
    onRenameCategory,
    onDeleteCategory,
    onDropFlow,
    dragState,
  };
}

/**
 * Build the config object for createFlowCard.
 * @param {{ runningMap: object, expandedCards: Set, drag: object, termManager: object, onRenderList: Function, onRun: Function, onToggle: Function, onRefresh: Function, onOpenModal: Function, onDeleteFlow: Function }} deps
 * @param {object} flow
 * @param {string} catId
 * @returns {HTMLElement}
 */
export function buildFlowCard(deps, flow, catId) {
  return createFlowCard({
    runningMap: deps.runningMap,
    expandedCards: deps.expandedCards,
    drag: deps.drag,
    termManager: deps.termManager,
    onRenderList: deps.onRenderList,
    onShowLog: (f, run) => deps.termManager.showRunLog(f, run),
    onRun: deps.onRun,
    onToggle: deps.onToggle,
    onRefresh: deps.onRefresh,
    onOpenModal: deps.onOpenModal,
    onDeleteFlow: deps.onDeleteFlow,
  }, flow, catId);
}

/**
 * Render the full flow list (categories + uncategorized).
 * @param {{ listEl: HTMLElement, flows: Array, catData: object, termManager: object, runningMap: object, buildParams: (cat: object, flows: Array, isUncat?: boolean) => object, createCard: (flow: object, catId: string) => HTMLElement }} ctx
 */
export function renderFlowList(ctx) {
  const { listEl, flows, catData, termManager, runningMap, buildParams, createCard } = ctx;
  if (!listEl) return;

  termManager.cleanupStaleLiveTerminals(runningMap);
  termManager.disposeAllLogTerminals();

  listEl.replaceChildren();

  const hasCats = catData.categories.length > 0;
  const uncatFlows = getUncategorizedFlows(flows, catData.order);

  if (flows.length === 0 && !hasCats) {
    listEl.appendChild(_el('div', 'flow-empty', EMPTY_LIST_MESSAGE));
    return;
  }

  for (const cat of catData.categories) {
    const catFlows = getFlowsForCategory(flows, catData.order, cat.id);
    listEl.appendChild(createCategoryGroup(buildParams(cat, catFlows)));
  }

  if (uncatFlows.length === 0 && !hasCats) return;
  if (hasCats) {
    listEl.appendChild(createCategoryGroup(
      buildParams({ id: UNCATEGORIZED, name: 'Sans catégorie' }, uncatFlows, true)
    ));
  } else {
    for (const flow of uncatFlows) {
      listEl.appendChild(createCard(flow, UNCATEGORIZED));
    }
  }
}

/**
 * Handle the "open modal" flow: prompt user, persist, and refresh.
 * @param {{ existing: object|null, catData: object, moveFlowToCategory: Function, persistCategories: Function, refresh: Function }} ctx
 * @param {Function} getOpenFlowModal - returns the openFlowModal component
 * @param {object} flowApi - the flow API service
 */
export async function handleOpenModal(ctx, getOpenFlowModal, flowApi) {
  const { existing, catData, moveFlowToCategory, persistCategories, refresh } = ctx;
  const openFlowModal = getOpenFlowModal();
  const flow = await openFlowModal(existing, catData.categories);
  if (!flow) return;

  const catId = flow._category;
  delete flow._category;

  await flowApi.save(flow);

  if (catId) {
    moveFlowToCategory(flow.id, catId);
  } else if (!existing) {
    if (!catData.order[UNCATEGORIZED]) catData.order[UNCATEGORIZED] = [];
    const allOrdered = new Set(Object.values(catData.order).flat());
    if (!allOrdered.has(flow.id)) {
      catData.order[UNCATEGORIZED].push(flow.id);
      await persistCategories();
    }
  }

  refresh();
}

/**
 * Delete a flow: dispose terminal, remove from order, persist, delete, refresh.
 * @param {{ termManager: object, catDataOrder: object, persistCategories: Function, refresh: Function }} deps
 * @param {string} flowId
 * @param {object} flowApi
 */
export async function deleteFlow(deps, flowId, flowApi) {
  deps.termManager.disposeLiveTerminal(flowId);
  removeFlowFromOrder(deps.catDataOrder, flowId);
  await deps.persistCategories();
  await flowApi.deleteFlow(flowId);
  deps.refresh();
}
