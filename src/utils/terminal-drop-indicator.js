/**
 * Drop indicator management for terminal panel drag-and-drop.
 * Extracted from terminal-panel.js to reduce component size.
 */
import { _el } from './dom-dialogs.js';
import { detectDropSide, computeIndicatorRect } from './split-primitives.js';

export class DropIndicatorManager {
  constructor(container) {
    this.container = container;
    this.indicator = null;
    this.targetId = null;
    this.side = null;
  }

  create() {
    this.indicator = _el('div', 'drop-indicator');
    this.container.appendChild(this.indicator);
  }

  remove() {
    if (this.indicator) {
      this.indicator.remove();
      this.indicator = null;
    }
    this.container.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));
    this.targetId = null;
    this.side = null;
  }

  update(mx, my, terminals, dragSourceId) {
    this.targetId = null;
    this.side = null;
    if (this.indicator) this.indicator.style.display = 'none';

    this.container.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));

    for (const [termId, node] of terminals) {
      if (termId === dragSourceId) continue;

      const rect = node.element.getBoundingClientRect();
      if (mx < rect.left || mx > rect.right || my < rect.top || my > rect.bottom) continue;

      const relX = (mx - rect.left) / rect.width;
      const relY = (my - rect.top) / rect.height;

      this.targetId = termId;
      this.side = detectDropSide(relX, relY);
      node.element.classList.add('drop-hover');

      this._positionIndicator(rect, this.side);
      return;
    }
  }

  _positionIndicator(rect, side) {
    if (!this.indicator) return;
    const s = this.indicator.style;
    const r = computeIndicatorRect(rect, side);
    s.display = 'block';
    s.left = `${r.left}px`;
    s.top = `${r.top}px`;
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
  }
}
