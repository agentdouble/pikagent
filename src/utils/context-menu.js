import { _el, positionInViewport } from './dom.js';

export class ContextMenu {
  constructor() {
    this.el = _el('div', { className: 'context-menu' });
    document.body.appendChild(this.el);

    /** Named handlers so they can be added/removed with the menu lifecycle. */
    this._onMouseDown = (e) => {
      if (!this.el.contains(e.target)) this.close();
    };
    this._onKeyDown = (e) => {
      if (e.key === 'Escape') this.close();
    };
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

    return _el('div', {
      className: 'context-menu-item',
      onClick: (e) => { e.stopPropagation(); this.close(); item.action(); },
    }, ...children);
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
    document.removeEventListener('keydown', this._onKeyDown);
    document.addEventListener('mousedown', this._onMouseDown);
    document.addEventListener('keydown', this._onKeyDown);
  }

  close() {
    this.el.style.display = 'none';
    document.removeEventListener('mousedown', this._onMouseDown);
    document.removeEventListener('keydown', this._onKeyDown);
  }
}

// Singleton
export const contextMenu = new ContextMenu();
