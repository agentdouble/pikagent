/**
 * Category group rendering for FlowView.
 * Handles category headers, collapse state, and drag-drop zone setup.
 * Extracted from flow-view.js to reduce component size.
 */
import { _el, renderButtonBar, buildChevronRow } from './dom.js';
import { setupDropZone } from './drop-zone-helpers.js';
import { CATEGORY_ACTIONS, UNCATEGORIZED } from './flow-view-helpers.js';
import { computeInsertionIndex } from './drag-helpers.js';

/**
 * Create a category group DOM element with header and flow items.
 * @param {{ cat: { id: string, name: string }, flows: Array<unknown>, isUncategorized: boolean, collapsedCategories: Set<string>, createCard: (flow: unknown, catId: string) => HTMLElement, onToggleCollapse: (catId: string) => void, onRenameCategory: (catId: string, nameEl: HTMLElement) => void, onDeleteCategory: (catId: string) => void, onDropFlow: (flowId: string, catId: string, insertIndex: number) => void, dragState: { getDragFlowId: () => string|null, clearDrag: () => void } }} params
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
  const header = _el('div', 'flow-category-header');

  const { chevron, name } = buildChevronRow({
    chevronClass: 'flow-category-chevron',
    nameClass: 'flow-category-name',
    name: cat.name,
    chevronText: '▼',
  });
  const count = _el('span', 'flow-category-count', `${flows.length}`);
  header.append(chevron, name, count);

  if (!isUncategorized) {
    const catHandlers = {
      rename: () => onRenameCategory(cat.id, name),
      delete: () => onDeleteCategory(cat.id),
    };
    const configs = CATEGORY_ACTIONS.map(({ text, title, cls, action }) => ({
      text,
      title,
      cls: cls ? `flow-category-btn ${cls}` : 'flow-category-btn',
      action,
      stopPropagation: true,
    }));
    header.appendChild(renderButtonBar({ containerClass: 'flow-category-actions', configs, handlers: catHandlers }));
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

/**
 * Remove all elements matching `selector` from `container`.
 * Shared by _updateDropIndicator / _setupCategoryDropZone / cleanupAllDragState.
 */
function clearIndicators(container, selector) {
  for (const el of container.querySelectorAll(selector)) {
    el.remove();
  }
}

function _getDropIndex(container, clientY) {
  const cards = [...container.querySelectorAll(':scope > .flow-card')];
  return computeInsertionIndex(cards, clientY, 'y');
}

/**
 * Remove all drag state indicators from the document.
 */
export function cleanupAllDragState() {
  clearIndicators(document, '.flow-drop-indicator');
  for (const el of document.querySelectorAll('.flow-drop-zone-active')) {
    el.classList.remove('flow-drop-zone-active');
  }
}
