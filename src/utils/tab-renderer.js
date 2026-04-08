/**
 * Tab element rendering helpers.
 * Extracted from tab-manager.js to reduce component size.
 *
 * Functions receive explicit dependency objects instead of the full
 * TabManager instance.
 *
 * @typedef {Object} TabElementDeps
 * @property {string|null} activeTabId            - Currently active tab id
 * @property {Map<string, Object>} tabs           - Tab map (used for .size)
 * @property {Function} switchTo                  - (id) => void
 * @property {Function} closeTab                  - (id) => void
 * @property {Function} renameTab                 - (id, nameEl) => void
 * @property {Function} setTabColorGroup          - (id, colorGroupId) => void
 * @property {Function} toggleNoShortcut          - (id) => void
 * @property {import('./tab-drag.js').TabDragDeps} dragDeps - Dependencies for tab drag
 */
import { _el, setupInlineInput } from './dom.js';
import { COLOR_GROUPS } from './tab-manager-helpers.js';
import { setupTabDrag } from './tab-drag.js';
import { attachContextMenu } from './context-menu.js';

/**
 * Build a single tab DOM element.
 * @param {TabElementDeps} deps
 * @param {string} id
 * @param {Object} tab
 */
export function buildTabElement(deps, id, tab) {
  const tabEl = _el('div', 'tab');
  tabEl.dataset.tabId = id;
  if (id === deps.activeTabId) tabEl.classList.add('active');
  if (tab.noShortcut) tabEl.classList.add('tab-no-shortcut');

  if (tab.colorGroup) {
    const cg = COLOR_GROUPS.find((c) => c.id === tab.colorGroup);
    if (cg) {
      const dot = _el('span', 'tab-color-dot');
      dot.style.background = cg.color;
      tabEl.appendChild(dot);
      tabEl.style.borderBottomColor = id === deps.activeTabId ? cg.color : '';
    }
  }

  const nameEl = _el('span', 'tab-name', tab.name);
  nameEl.addEventListener('dblclick', () => deps.renameTab(id, nameEl));
  tabEl.appendChild(nameEl);

  if (deps.tabs.size > 1) {
    const closeEl = _el('span', 'tab-close', '\u00d7');
    closeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      deps.closeTab(id);
    });
    tabEl.appendChild(closeEl);
  }

  tabEl.addEventListener('click', () => deps.switchTo(id));
  setupTabDrag(deps.dragDeps, tabEl, id);
  bindTabContextMenu(deps, tabEl, id, tab, nameEl);

  return tabEl;
}

/**
 * Bind context menu to a tab element.
 * @param {TabElementDeps} deps
 * @param {HTMLElement} tabEl
 * @param {string} id
 * @param {Object} tab
 * @param {HTMLElement} nameEl
 */
export function bindTabContextMenu(deps, tabEl, id, tab, nameEl) {
  attachContextMenu(tabEl, () => {
    const colorItems = COLOR_GROUPS.map((cg) => ({
      label: `${tab.colorGroup === cg.id ? '\u2713 ' : ''}${cg.label}`,
      colorDot: cg.color,
      action: () => deps.setTabColorGroup(id, tab.colorGroup === cg.id ? null : cg.id),
    }));
    if (tab.colorGroup) {
      colorItems.push({ label: 'Remove color', action: () => deps.setTabColorGroup(id, null) });
    }
    return [
      { label: 'Rename', action: () => deps.renameTab(id, nameEl) },
      {
        label: tab.noShortcut ? '\u2713 NoShortcut' : 'NoShortcut',
        action: () => deps.toggleNoShortcut(id),
      },
      { separator: true },
      { label: 'Color Group', children: colorItems },
      { separator: true },
      { label: 'Close', action: () => deps.closeTab(id) },
    ];
  });
}

/**
 * Inline rename a tab.
 * @param {Object} tab
 * @param {HTMLElement} nameEl
 * @param {function} onCommit - callback after successful rename (re-render + save)
 * @param {function} onCancel - callback on cancel (re-render only, no save)
 */
export function inlineRenameTab(tab, nameEl, onCommit, onCancel) {
  const input = _el('input', { className: 'tab-rename-input', value: tab.name });
  nameEl.replaceWith(input);
  input.focus();
  input.select();

  setupInlineInput(input, {
    onCommit: (newName) => {
      tab.name = newName || tab.name;
      onCommit();
    },
    onCancel,
  });
}
