export class ContextMenu {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'context-menu';
    document.body.appendChild(this.el);

    // Close on click/mousedown outside or Escape
    document.addEventListener('mousedown', (e) => {
      if (!this.el.contains(e.target)) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  }

  show(x, y, items) {
    this.el.innerHTML = '';

    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'context-menu-separator';
        this.el.appendChild(sep);
        continue;
      }

      const row = document.createElement('div');
      row.className = 'context-menu-item';

      const label = document.createElement('span');
      label.textContent = item.label;
      row.appendChild(label);

      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'context-menu-shortcut';
        shortcut.textContent = item.shortcut;
        row.appendChild(shortcut);
      }

      row.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
        item.action();
      });

      this.el.appendChild(row);
    }

    // Position: keep within viewport
    this.el.style.display = 'block';
    const rect = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    this.el.style.left = `${Math.min(x, vw - rect.width - 8)}px`;
    this.el.style.top = `${Math.min(y, vh - rect.height - 8)}px`;
  }

  close() {
    this.el.style.display = 'none';
  }
}

// Singleton
export const contextMenu = new ContextMenu();
