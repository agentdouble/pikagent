/**
 * Tab element rendering helpers.
 * Extracted from tab-manager.js to reduce component size.
 *
 * Functions receive explicit dependency objects instead of the full
 * TabManager instance.
 *
 * @typedef {{ activeTabId: string|null, tabs: Map<string, import('./tab-types.js').WorkspaceTab>, switchTo: (id: string) => void, closeTab: (id: string) => void, renameTab: (id: string, nameEl: HTMLElement) => void, setTabColorGroup: (id: string, colorGroupId: string|null) => void, toggleNoShortcut: (id: string) => void, dragDeps: import('./tab-drag.js').TabDragDeps }} TabElementDeps
 */
import { _el, buildChevronRow } from './dom.js';
import { startInlineRename } from './form-helpers.js';
import { COLOR_GROUPS } from './tab-constants.js';
import { setupTabDrag } from './tab-drag.js';
import { attachContextMenu } from './context-menu.js';
import { onClickStopped } from './event-helpers.js';

/**
 * Generic tab element factory.
 *
 * Both the workspace tab bar and the file-viewer tab bar share the same
 * structural pattern: base element + optional prefix children + name +
 * optional close button + click handler.  This factory captures that
 * pattern while remaining fully configurable.
 *
 * @typedef {{ className: string, isActive: boolean, name: string, nameClass?: string, extraClasses?: string[], prefixEls?: HTMLElement[], close?: { text: string, className: string, onClick: (e: Event) => void }|null, onClick: (tabEl: HTMLElement) => void, setup?: (tabEl: HTMLElement, nameEl: HTMLElement) => void, dataset?: Record<string,string>, style?: Record<string,string> }} TabConfig
 *
 * @param {TabConfig} config
 * @returns {{ tabEl: HTMLElement, nameEl: HTMLElement }}
 */
export function createTabElement(config) {
  // Build close button (appended after name via extraChildren)
  const closeChildren = [];
  if (config.close) {
    const closeEl = _el('span', config.close.className, config.close.text);
    onClickStopped(closeEl, (e) => config.close.onClick(e));
    closeChildren.push(closeEl);
  }

  const { name: nameEl, row: tabEl } = buildChevronRow({
    containerClass: config.className,
    nameClass: config.nameClass || '',
    name: config.name,
    prefixChildren: config.prefixEls || [],
    extraChildren: closeChildren,
  });

  if (config.isActive) tabEl.classList.add('active');
  if (config.extraClasses) {
    for (const cls of config.extraClasses) tabEl.classList.add(cls);
  }
  if (config.dataset) {
    for (const [k, v] of Object.entries(config.dataset)) tabEl.dataset[k] = v;
  }
  if (config.style) {
    for (const [k, v] of Object.entries(config.style)) {
      if (k.startsWith('--')) tabEl.style.setProperty(k, v);
      else tabEl.style[k] = v;
    }
  }

  tabEl.addEventListener('click', () => config.onClick(tabEl));

  if (config.setup) {
    config.setup(tabEl, nameEl);
  }

  return { tabEl, nameEl };
}

/**
 * Build a single tab DOM element.
 * @param {TabElementDeps} deps
 * @param {string} id
 * @param {import('./tab-types.js').WorkspaceTab} tab
 */
export function buildTabElement(deps, id, tab) {
  const isActive = id === deps.activeTabId;

  // Build optional prefix elements
  const prefixEls = [];
  let accentColor = '';
  if (tab.colorGroup) {
    const cg = COLOR_GROUPS.find((c) => c.id === tab.colorGroup);
    if (cg) {
      const dot = _el('span', 'tab-color-dot');
      dot.style.background = cg.color;
      prefixEls.push(dot);
      if (isActive) accentColor = cg.color;
    }
  }

  const extraClasses = [];
  if (tab.noShortcut) extraClasses.push('tab-no-shortcut');

  const { tabEl, nameEl } = createTabElement({
    className: 'tab',
    isActive,
    name: tab.name,
    nameClass: 'tab-name',
    extraClasses,
    prefixEls,
    dataset: { tabId: id },
    style: accentColor ? { '--tab-accent': accentColor } : undefined,
    close: deps.tabs.size > 1
      ? { text: '\u00d7', className: 'tab-close', onClick: () => deps.closeTab(id) }
      : null,
    onClick: () => deps.switchTo(id),
    setup: (el, nEl) => {
      nEl.addEventListener('dblclick', () => deps.renameTab(id, nEl));
      setupTabDrag(deps.dragDeps, el, id);
      bindTabContextMenu(deps, el, id, tab, nEl);
    },
  });

  return tabEl;
}

/**
 * Bind context menu to a tab element.
 * @param {TabElementDeps} deps
 * @param {HTMLElement} tabEl
 * @param {string} id
 * @param {import('./tab-types.js').WorkspaceTab} tab
 * @param {HTMLElement} nameEl
 */
function bindTabContextMenu(deps, tabEl, id, tab, nameEl) {
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
 * @param {import('./tab-types.js').WorkspaceTab} tab
 * @param {HTMLElement} nameEl
 * @param {() => void} onCommit - callback after successful rename (re-render + save)
 * @param {() => void} onCancel - callback on cancel (re-render only, no save)
 */
export function inlineRenameTab(tab, nameEl, onCommit, onCancel) {
  startInlineRename(nameEl, {
    className: 'tab-rename-input',
    value: tab.name,
    onCommit: (newName) => {
      if (newName) {
        tab.name = newName;
        tab.userNamed = true;
      }
      onCommit();
    },
    onCancel,
  });
}
