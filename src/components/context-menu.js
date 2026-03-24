/** Viewport edge padding (px) when clamping menu position. */
const VIEWPORT_PADDING = 8;

function _el(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'textContent') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el[k] = v;
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

export class ContextMenu {
  constructor() {
    this.el = _el('div', { className: 'context-menu' });
    document.body.appendChild(this.el);

    document.addEventListener('mousedown', (e) => {
      if (!this.el.contains(e.target)) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
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
    this.el.style.left = `${Math.min(x, window.innerWidth - width - VIEWPORT_PADDING)}px`;
    this.el.style.top = `${Math.min(y, window.innerHeight - height - VIEWPORT_PADDING)}px`;
  }

  close() {
    this.el.style.display = 'none';
  }
}

// Singleton
export const contextMenu = new ContextMenu();
