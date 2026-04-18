/**
 * @typedef {{ label?: string, action?: () => void, separator?: boolean, shortcut?: string, colorDot?: string, children?: Array<ContextMenuItem> }} ContextMenuItem
 */

import { _el } from './dom.js';
import { onClickStopped } from './event-helpers.js';
import { setupKeyboardShortcuts } from './keyboard-helpers.js';

/**
 * Clamp (x, y) so a box of (width, height) stays within the viewport.
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {number} [padding=8]
 * @returns {{ left: number, top: number }}
 */
function positionInViewport(x, y, width, height, padding = 8) {
  return {
    left: Math.min(x, window.innerWidth  - width  - padding),
    top:  Math.min(y, window.innerHeight - height - padding),
  };
}

export class ContextMenu {
  constructor() {
    this.el = _el('div', { className: 'context-menu' });
    document.body.appendChild(this.el);

    /** Named handlers so they can be added/removed with the menu lifecycle. */
    this._onMouseDown = (e) => {
      if (!this.el.contains(e.target)) this.close();
    };
    this._cleanupKeyboard = null;
  }

  _buildItem(item) {
    if (item.separator) return _el('div', { className: 'context-menu-separator' });

    // Submenu item
    if (item.children) {
      const wrapper = _el('div', { className: 'context-menu-item context-menu-submenu' });

      const labelRow = _el('span');
      labelRow.textContent = item.label;
      wrapper.appendChild(labelRow);
      wrapper.appendChild(_el('span', { className: 'context-menu-arrow', textContent: '\u25B8' }));

      const sub = _el('div', { className: 'context-menu context-menu-sub' });
      for (const child of item.children) sub.appendChild(this._buildItem(child));
      wrapper.appendChild(sub);

      return wrapper;
    }

    const children = [];
    if (item.colorDot) {
      const dot = _el('span', { className: 'context-menu-color-dot' });
      dot.style.background = item.colorDot;
      children.push(dot);
    }
    children.push(_el('span', { textContent: item.label }));
    if (item.shortcut) {
      children.push(_el('span', { className: 'context-menu-shortcut', textContent: item.shortcut }));
    }

    const itemEl = _el('div', { className: 'context-menu-item' }, ...children);
    onClickStopped(itemEl, () => { this.close(); item.action(); });
    return itemEl;
  }

  show(x, y, items) {
    this.el.replaceChildren(...items.map((item) => this._buildItem(item)));

    this.el.style.display = 'block';
    const { width, height } = this.el.getBoundingClientRect();
    const { left, top } = positionInViewport(x, y, width, height);
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;

    // Register dismiss listeners only while visible (idempotent remove-then-add)
    document.removeEventListener('mousedown', this._onMouseDown);
    if (this._cleanupKeyboard) this._cleanupKeyboard();
    document.addEventListener('mousedown', this._onMouseDown);
    this._cleanupKeyboard = setupKeyboardShortcuts(document, {
      onEscape: () => this.close(),
    });
  }

  close() {
    this.el.style.display = 'none';
    document.removeEventListener('mousedown', this._onMouseDown);
    if (this._cleanupKeyboard) { this._cleanupKeyboard(); this._cleanupKeyboard = null; }
  }
}

// Singleton
export const contextMenu = new ContextMenu();

/**
 * Attach a contextmenu listener to `el` that prevents the default behaviour,
 * stops propagation, and – when `buildItems` returns an array of menu items –
 * shows the context menu at the pointer position.
 *
 * If `buildItems` returns a falsy value the menu is not shown, which is useful
 * when the callback only needs the event for side-effects (e.g. toggling a
 * colour filter).
 *
 * @param {HTMLElement} el - element to listen on
 * @param {(e: MouseEvent) => Array<ContextMenuItem>|void} buildItems - receives the raw event,
 *   should return an items array (or nothing).
 */
export function attachContextMenu(el, buildItems) {
  el.addEventListener('contextmenu', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const items = await buildItems(e);
    if (items) {
      contextMenu.show(e.clientX, e.clientY, items);
    }
  });
}
