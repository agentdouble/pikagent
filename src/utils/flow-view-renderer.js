/**
 * DOM construction helpers for FlowView.
 * Extracted from flow-view.js to reduce component size.
 */

import { _el, renderButtonBar } from './dom.js';
import { EMPTY_LIST_MESSAGE, HEADER_BUTTONS, UNCATEGORIZED, getFlowsForCategory, getUncategorizedFlows } from './flow-view-helpers.js';
import { createCategoryGroup } from './flow-category-renderer.js';

/**
 * Build the main layout: header + list container.
 *
 * @param {{ onAddCategory: () => void, onAddFlow: () => void }} deps
 * @returns {{ wrapper: HTMLElement, listEl: HTMLElement }}
 */
export function buildFlowLayout(deps) {
  const wrapper = _el('div', 'flow-container');

  const header = _el('div', 'flow-header');
  header.appendChild(_el('h2', 'flow-title', 'Flows'));

  const headerHandlers = { addCategory: deps.onAddCategory, addFlow: deps.onAddFlow };
  const configs = HEADER_BUTTONS.map(({ label, action }) => ({
    label,
    cls: 'flow-add-btn',
    action,
  }));
  const headerRight = renderButtonBar({ containerClass: 'flow-header-right', configs, handlers: headerHandlers });
  headerRight.style.display = 'flex';
  headerRight.style.gap = '8px';

  header.appendChild(headerRight);
  wrapper.appendChild(header);

  const listEl = _el('div', 'flow-list');
  wrapper.appendChild(listEl);

  return { wrapper, listEl };
}

/**
 * Render categorized groups and uncategorized section into `listEl`.
 *
 * @param {HTMLElement} listEl
 * @param {Array<{ id: string }>} flows
 * @param {{ categories: Array<{ id: string, name: string }>, order: Record<string, string[]> }} catData
 * @param {(cat: { id: string, name: string }, flows: Array<{ id: string }>, isUncat?: boolean) => Record<string, unknown>} buildGroupParams
 * @param {(flow: { id: string }, catId: string) => HTMLElement} createCard
 */
export function renderFlowList(listEl, flows, catData, buildGroupParams, createCard) {
  listEl.replaceChildren();

  const hasCats = catData.categories.length > 0;
  const uncatFlows = getUncategorizedFlows(flows, catData.order);

  if (flows.length === 0 && !hasCats) {
    listEl.appendChild(_el('div', 'flow-empty', EMPTY_LIST_MESSAGE));
    return;
  }

  // Named categories
  for (const cat of catData.categories) {
    const catFlows = getFlowsForCategory(flows, catData.order, cat.id);
    listEl.appendChild(createCategoryGroup(buildGroupParams(cat, catFlows)));
  }

  // Uncategorized section
  if (uncatFlows.length === 0 && !hasCats) return;
  if (hasCats) {
    listEl.appendChild(createCategoryGroup(
      buildGroupParams({ id: UNCATEGORIZED, name: 'Sans catégorie' }, uncatFlows, true),
    ));
  } else {
    for (const flow of uncatFlows) {
      listEl.appendChild(createCard(flow, UNCATEGORIZED));
    }
  }
}
