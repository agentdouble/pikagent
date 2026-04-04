/**
 * Category group rendering for FlowView.
 * Handles category headers, collapse state, and drag-drop zone setup.
 * Extracted from flow-view.js to reduce component size.
 */
import { _el } from '../utils/dom.js';
import { CATEGORY_ACTIONS, UNCATEGORIZED } from '../utils/flow-view-helpers.js';

/**
 * Create a category group DOM element with header and flow items.
 * @param {Object} params
 * @param {Object} params.cat - { id, name }
 * @param {Array} params.flows - flow objects in this category
 * @param {boolean} params.isUncategorized
 * @param {Set} params.collapsedCategories
 * @param {function} params.createCard - (flow, catId) => HTMLElement
 * @param {function} params.onToggleCollapse - (catId) => void
 * @param {function} params.onRenameCategory - (catId, nameEl) => void
 * @param {function} params.onDeleteCategory - (catId) => void
 * @param {function} params.onDropFlow - (flowId, catId, insertIndex) => void
 * @param {Object} params.dragState - { getDragFlowId, clearDrag }
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

  const chevron = _el('span', 'flow-category-chevron', '▼');
  const name = _el('span', 'flow-category-name', cat.name);
  const count = _el('span', 'flow-category-count', `${flows.length}`);
  header.append(chevron, name, count);

  if (!isUncategorized) {
    const actions = _el('div', 'flow-category-actions');
    const catHandlers = {
      rename: () => onRenameCategory(cat.id, name),
      delete: () => onDeleteCategory(cat.id),
    };
    for (const { icon, title, cls, action } of CATEGORY_ACTIONS) {
      const btn = _el('button', cls ? `flow-category-btn ${cls}` : 'flow-category-btn', icon);
      btn.title = title;
      btn.addEventListener('click', (e) => { e.stopPropagation(); catHandlers[action](); });
      actions.appendChild(btn);
    }
    header.appendChild(actions);
  }

  header.addEventListener('click', () => onToggleCollapse(cat.id));

  return header;
}

function _setupCategoryDropZone(items, catId, onDropFlow, dragState) {
  items.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    items.classList.add('flow-drop-zone-active');
    _updateDropIndicator(items, e.clientY);
  });

  items.addEventListener('dragleave', (e) => {
    if (!items.contains(e.relatedTarget)) {
      items.classList.remove('flow-drop-zone-active');
      _clearDropIndicators(items);
    }
  });

  items.addEventListener('drop', (e) => {
    e.preventDefault();
    items.classList.remove('flow-drop-zone-active');
    _clearDropIndicators(items);

    const dragFlowId = dragState.getDragFlowId();
    if (!dragFlowId) return;

    const insertIndex = _getDropIndex(items, e.clientY);
    dragState.clearDrag();
    onDropFlow(dragFlowId, catId, insertIndex);
  });
}

// --- Drop indicator helpers ---

function _updateDropIndicator(container, clientY) {
  _clearDropIndicators(container);

  const cards = [...container.querySelectorAll(':scope > .flow-card')];
  if (cards.length === 0) return;

  let insertBefore = null;
  for (const card of cards) {
    const rect = card.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) {
      insertBefore = card;
      break;
    }
  }

  const indicator = _el('div', 'flow-drop-indicator flow-drop-active');
  if (insertBefore) {
    container.insertBefore(indicator, insertBefore);
  } else {
    container.appendChild(indicator);
  }
}

function _clearDropIndicators(container) {
  for (const el of container.querySelectorAll('.flow-drop-indicator')) {
    el.remove();
  }
}

function _getDropIndex(container, clientY) {
  const cards = [...container.querySelectorAll(':scope > .flow-card')];
  for (let i = 0; i < cards.length; i++) {
    const rect = cards[i].getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (clientY < midY) return i;
  }
  return -1; // append at end
}

/**
 * Remove all drag state indicators from the document.
 */
export function cleanupAllDragState() {
  for (const el of document.querySelectorAll('.flow-drop-indicator')) el.remove();
  for (const el of document.querySelectorAll('.flow-drop-zone-active')) {
    el.classList.remove('flow-drop-zone-active');
  }
}
