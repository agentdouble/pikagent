/**
 * Category group rendering for FlowView.
 * Handles category headers, collapse state, and drag-drop zone setup.
 * Extracted from flow-view.js to reduce component size.
 */
import { _el, buildDomainButtonBar } from './flow-dom.js';
import { buildChevronRow } from './chevron-row.js';
import { setupDropZone } from './drop-zone-helpers.js';
import { CATEGORY_ACTIONS, UNCATEGORIZED } from './flow-view-helpers.js';
import { computeInsertionIndex } from './drag-helpers.js';
import { clearIndicators } from './flow-drag-cleanup.js';

/**
 * Create a category group DOM element with header and flow items.
 * @param {{ cat: { id: string, name: string }, flows: Array<import('./flow-card-setup.js').FlowDescriptor>, isUncategorized: boolean, collapsedCategories: Set<string>, createCard: (flow: import('./flow-card-setup.js').FlowDescriptor, catId: string) => HTMLElement, onToggleCollapse: (catId: string) => void, onRenameCategory: (catId: string, nameEl: HTMLElement) => void, onDeleteCategory: (catId: string) => void, onDropFlow: (flowId: string, catId: string, insertIndex: number) => void, dragState: { getDragFlowId: () => string|null, clearDrag: () => void } }} params
 * @returns {HTMLElement}
 */
export function createCategoryGroup(params) {
  const { cat, flows, isUncategorized, collapsedCategories, createCard,
          onToggleCollapse, onRenameCategory, onDeleteCategory, onDropFlow, dragState } = params;

  const isCollapsed = collapsedCategories.has(cat.id);
  const group = _el('div', `flow-category-group${isCollapsed ? ' flow-category-collapsed' : ''}`);
  group.dataset.catId = cat.id;

  group.appendChild(_buildCategoryHeader(cat, flows, isUncategorized, collapsedCategories,
    onToggleCollapse, onRenameCategory, onDeleteCategory));

  const items = _el('div', 'flow-category-items');
  items.dataset.catId = cat.id;
  _setupCategoryDropZone(items, cat.id, onDropFlow, dragState);

  if (!isCollapsed) {
    for (const flow of flows) {
      items.appendChild(createCard(flow, cat.id));
    }
    if (flows.length === 0) {
      items.appendChild(_el('div', {
        className: 'flow-empty',
        style: { padding: '12px 0', fontSize: '12px' },
        textContent: 'Glissez un flow ici',
      }));
    }
  }

  group.appendChild(items);
  return group;
}

function _buildCategoryHeader(cat, flows, isUncategorized, collapsedCategories, onToggleCollapse, onRenameCategory, onDeleteCategory) {
  const count = _el('span', 'flow-category-count', `${flows.length}`);
  const { chevron, name, row: header } = buildChevronRow({
    chevronClass: 'flow-category-chevron',
    nameClass: 'flow-category-name',
    name: cat.name,
    chevronText: '▼',
    containerClass: 'flow-category-header',
    extraChildren: [count],
  });

  if (!isUncategorized) {
    const catHandlers = {
      rename: () => onRenameCategory(cat.id, name),
      delete: () => onDeleteCategory(cat.id),
    };
    header.appendChild(buildDomainButtonBar('flow-category-btn', 'flow-category-actions', CATEGORY_ACTIONS, catHandlers));
  }

  header.addEventListener('click', () => onToggleCollapse(cat.id));

  return header;
}

function _setupCategoryDropZone(items, catId, onDropFlow, dragState) {
  setupDropZone(items, {
    hoverClass: 'flow-drop-zone-active',
    onDragOver: (e) => {
      e.dataTransfer.dropEffect = 'move';
      _updateDropIndicator(items, e.clientY);
    },
    onDragLeave: (e) => {
      if (!items.contains(e.relatedTarget)) {
        items.classList.remove('flow-drop-zone-active');
        clearIndicators(items, '.flow-drop-indicator');
      }
    },
    onDrop: (e) => {
      clearIndicators(items, '.flow-drop-indicator');

      const dragFlowId = dragState.getDragFlowId();
      if (!dragFlowId) return;

      const insertIndex = _getDropIndex(items, e.clientY);
      dragState.clearDrag();
      onDropFlow(dragFlowId, catId, insertIndex);
    },
  });
}

// --- Drop indicator helpers ---

function _updateDropIndicator(container, clientY) {
  clearIndicators(container, '.flow-drop-indicator');

  const cards = [...container.querySelectorAll(':scope > .flow-card')];
  if (cards.length === 0) return;

  const idx = computeInsertionIndex(cards, clientY, 'y');
  const insertBefore = idx === -1 ? null : cards[idx];

  const indicator = _el('div', 'flow-drop-indicator flow-drop-active');
  if (insertBefore) {
    container.insertBefore(indicator, insertBefore);
  } else {
    container.appendChild(indicator);
  }
}

function _getDropIndex(container, clientY) {
  const cards = [...container.querySelectorAll(':scope > .flow-card')];
  return computeInsertionIndex(cards, clientY, 'y');
}
