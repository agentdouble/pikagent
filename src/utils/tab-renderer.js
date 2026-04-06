/**
 * Tab element rendering helpers.
 * Extracted from tab-manager.js to reduce component size.
 */
import { _el, setupInlineInput } from './dom.js';
import { COLOR_GROUPS } from './tab-manager-helpers.js';
import { setupTabDrag } from './tab-drag.js';
import { contextMenu } from './context-menu.js';

/**
 * Build a single tab DOM element.
 * @param {Object} ctx - { tabs, activeTabId, switchTo, closeTab, renameTab }
 * @param {string} id
 * @param {Object} tab
 */
export function buildTabElement(ctx, id, tab) {
  const tabEl = _el('div', 'tab');
  tabEl.dataset.tabId = id;
  if (id === ctx.activeTabId) tabEl.classList.add('active');
  if (tab.noShortcut) tabEl.classList.add('tab-no-shortcut');

  if (tab.colorGroup) {
    const cg = COLOR_GROUPS.find((c) => c.id === tab.colorGroup);
    if (cg) {
      const dot = _el('span', 'tab-color-dot');
      dot.style.background = cg.color;
      tabEl.appendChild(dot);
      tabEl.style.borderBottomColor = id === ctx.activeTabId ? cg.color : '';
    }
  }

  const nameEl = _el('span', 'tab-name', tab.name);
  nameEl.addEventListener('dblclick', () => ctx.renameTab(id, nameEl));
  tabEl.appendChild(nameEl);

  if (ctx.tabs.size > 1) {
    const closeEl = _el('span', 'tab-close', '\u00d7');
    closeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      ctx.closeTab(id);
    });
    tabEl.appendChild(closeEl);
  }

  tabEl.addEventListener('click', () => ctx.switchTo(id));
  setupTabDrag(ctx, tabEl, id);
  bindTabContextMenu(ctx, tabEl, id, tab, nameEl);

  return tabEl;
}

/**
 * Bind context menu to a tab element.
 */
export function bindTabContextMenu(ctx, tabEl, id, tab, nameEl) {
  tabEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const colorItems = COLOR_GROUPS.map((cg) => ({
      label: `${tab.colorGroup === cg.id ? '\u2713 ' : ''}${cg.label}`,
      colorDot: cg.color,
      action: () => ctx.setTabColorGroup(id, tab.colorGroup === cg.id ? null : cg.id),
    }));
    if (tab.colorGroup) {
      colorItems.push({ label: 'Remove color', action: () => ctx.setTabColorGroup(id, null) });
    }
    contextMenu.show(e.clientX, e.clientY, [
      { label: 'Rename', action: () => ctx.renameTab(id, nameEl) },
      {
        label: tab.noShortcut ? '\u2713 NoShortcut' : 'NoShortcut',
        action: () => ctx.toggleNoShortcut(id),
      },
      { separator: true },
      { label: 'Color Group', children: colorItems },
      { separator: true },
      { label: 'Close', action: () => ctx.closeTab(id) },
    ]);
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
