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
} from './flow-view-helpers.js';
import { createCategoryGroup } from './flow-category-renderer.js';
import { createFlowCard } from './flow-card-setup.js';
import { _el, buildDomainButtonBar } from './dom.js';
import { buildViewHeader } from './view-header.js';

/**
 * Build the outer shell DOM for the FlowView (wrapper + header + listEl).
 * @param {HTMLElement} container
 * @param {{ onAddCategory: () => void, onAddFlow: () => void }} handlers
 * @returns {{ listEl: HTMLElement }}
 */
export function renderFlowViewShell(container, handlers) {
  container.replaceChildren();
  const wrapper = _el('div', 'flow-container');

  const headerHandlers = { addCategory: handlers.onAddCategory, addFlow: handlers.onAddFlow };
  const headerRight = buildDomainButtonBar('flow-add-btn', 'flow-header-right', HEADER_BUTTONS, headerHandlers);
  headerRight.style.display = 'flex';
  headerRight.style.gap = '8px';

  const header = buildViewHeader({ baseClass: 'flow', title: 'Flows', actions: headerRight });
  wrapper.appendChild(header);
  const listEl = _el('div', 'flow-list');
  wrapper.appendChild(listEl);
  container.appendChild(wrapper);
  return { listEl };
}

/**
 * Build the shared groupParams object for a category section.
 * @param {{
 *   cat: { id: string, name: string },
 *   flows: Array<import('./flow-card-setup.js').FlowDescriptor>,
 *   isUncat: boolean,
 *   collapsedCategories: Set<string>,
 *   createCard: (flow: import('./flow-card-setup.js').FlowDescriptor, catId: string) => HTMLElement,
 *   onToggleCollapse: (catId: string) => void,
 *   onRenameCategory: (catId: string, nameEl: HTMLElement) => void,
 *   onDeleteCategory: (catId: string) => void,
 *   onDropFlow: (flowId: string, catId: string, insertIndex: number) => void,
 *   dragState: { getDragFlowId: () => string|null, clearDrag: () => void },
 * }} opts
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
 * @param {{
 *   runningMap: Record<string, string>,
 *   expandedCards: Set<string>,
 *   drag: { flowId: string|null, catId: string|null },
 *   termManager: import('../components/flow-card-terminal.js').FlowCardTerminalManager,
 *   onRenderList: () => void,
 *   onRun: (flowId: string) => void,
 *   onToggle: (flowId: string) => Promise<void>,
 *   onRefresh: () => void,
 *   onOpenModal: (flow: import('./flow-card-setup.js').FlowDescriptor) => void,
 *   onDeleteFlow: (flowId: string) => void,
 * }} deps
 * @param {import('./flow-card-setup.js').FlowDescriptor} flow
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
 * @param {{
 *   listEl: HTMLElement,
 *   flows: Array<import('./flow-card-setup.js').FlowDescriptor>,
 *   catData: { categories: Array<{ id: string, name: string }>, order: Record<string, string[]> },
 *   termManager: import('../components/flow-card-terminal.js').FlowCardTerminalManager,
 *   runningMap: Record<string, string>,
 *   buildParams: (cat: { id: string, name: string }, flows: Array<import('./flow-card-setup.js').FlowDescriptor>, isUncat?: boolean) => object,
 *   createCard: (flow: import('./flow-card-setup.js').FlowDescriptor, catId: string) => HTMLElement,
 * }} ctx
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
 * @param {{
 *   existing: import('./flow-card-setup.js').FlowDescriptor|null,
 *   catData: { categories: Array<{ id: string, name: string }>, order: Record<string, string[]> },
 *   moveFlowToCategory: (flowId: string, catId: string) => void,
 *   persistCategories: () => Promise<void>,
 *   refresh: () => void,
 * }} ctx
 * @param {() => (existing: import('./flow-card-setup.js').FlowDescriptor|null, categories: Array<{ id: string, name: string }>) => Promise<(import('./flow-card-setup.js').FlowDescriptor & { _category?: string })|null>} getOpenFlowModal - returns the openFlowModal component
 * @param {{ save: (flow: import('./flow-card-setup.js').FlowDescriptor) => Promise<unknown> }} flowApi - the flow API service
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
 * @param {{
 *   termManager: import('../components/flow-card-terminal.js').FlowCardTerminalManager,
 *   catDataOrder: Record<string, string[]>,
 *   persistCategories: () => Promise<void>,
 *   refresh: () => void,
 * }} deps
 * @param {string} flowId
 * @param {{ deleteFlow: (flowId: string) => Promise<unknown> }} flowApi
 */
export async function deleteFlow(deps, flowId, flowApi) {
  deps.termManager.disposeLiveTerminal(flowId);
  removeFlowFromOrder(deps.catDataOrder, flowId);
  await deps.persistCategories();
  await flowApi.deleteFlow(flowId);
  deps.refresh();
}
