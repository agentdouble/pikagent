import { bus } from '../utils/events.js';
import { _el } from '../utils/dom.js';
import { trackMouse } from '../utils/drag-helpers.js';
import { TerminalInstance } from '../utils/terminal-instance.js';
import { DRAG_GRIP, SplitNode, RESIZE_CURSOR, DIRECTION_PROPS } from '../utils/terminal-panel-helpers.js';
import {
  detectDropSide,
  computeIndicatorRect,
  computeResizeRatio,
  findClosestInDirection,
  directionFromSide,
  isInsertBefore,
} from '../utils/split-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import { serializeLayout, serializeElement } from '../utils/terminal-serializer.js';
import {
  getPanels,
  detachElement,
  moveToCenter,
  insertIntoSplit,
  wrapInNewSplit,
} from '../utils/split-layout-ops.js';

export class TerminalPanel {
  constructor(container, cwd) {
    this.container = container;
    this.cwd = cwd;
    this.root = null;
    this.activeTerminal = null;
    this.terminals = new Map();

    // Drag and drop state
    this._dragSourceId = null;
    this._dropIndicator = null;
    this._dropTarget = null;
    this._dropSide = null;

    this.init();
  }

  // ===== DOM Helpers =====

  _createSplitHandle(direction, splitEl) {
    const handle = _el('div', `split-handle split-handle-${direction}`);
    this.setupResizeHandle(handle, splitEl, direction);
    return handle;
  }

  _createSplitContainer(direction, flex = '1') {
    const el = _el('div', `split-container split-${direction}`);
    el.style.flex = String(flex);
    return el;
  }

  _isSameDirectionSplit(el, direction) {
    return el?.classList.contains('split-container') && el.classList.contains(`split-${direction}`);
  }

  _findTerminalCwd(el) {
    for (const [, node] of this.terminals) {
      if (node.element === el) return node.terminal.cwd;
    }
    return this.cwd;
  }

  _resetContainer() {
    this.container.replaceChildren();
    this.container.className = 'terminal-panel';
  }

  _buildTopBar(node) {
    const topBar = _el('div', 'terminal-top-bar');

    const dragHandle = _el('div', 'terminal-drag-handle', { title: 'Drag to move' });
    dragHandle.appendChild(_el('span', 'drag-grip', { textContent: DRAG_GRIP }));

    const closeBtn = _el('button', 'terminal-close-btn', {
      textContent: '×',
      title: 'Close terminal',
    });
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeTerminal(node.terminal.id);
    });

    topBar.appendChild(dragHandle);
    topBar.appendChild(closeBtn);

    this.setupDrag(dragHandle, node);
    return topBar;
  }

  _adjacentPanels(handle, splitEl) {
    const children = Array.from(splitEl.children);
    const idx = children.indexOf(handle);
    let before = null, after = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (!children[i].classList.contains('split-handle')) { before = children[i]; break; }
    }
    for (let i = idx + 1; i < children.length; i++) {
      if (!children[i].classList.contains('split-handle')) { after = children[i]; break; }
    }
    return [before, after];
  }

  init() {
    this._resetContainer();

    const node = this.createTerminalNode();
    this.root = node;
    this.container.appendChild(node.element);
    this.setActive(node);
  }

  restoreFromTree(tree) {
    for (const [id, node] of this.terminals) {
      node.terminal.dispose();
    }
    this.terminals.clear();

    this._resetContainer();

    const node = this.buildFromTree(tree);
    this.root = node;
    this.container.appendChild(node.element);

    const first = this.terminals.values().next().value;
    if (first) this.setActive(first);
    this.fitAll();
  }

  buildFromTree(tree) {
    if (tree.type === 'terminal') {
      const node = this.createTerminalNode(tree.cwd);
      node.element.style.flex = String(tree.flex || 1);
      return node;
    }

    const splitEl = this._createSplitContainer(tree.direction, tree.flex || 1);

    const splitNode = new SplitNode('split');
    splitNode.direction = tree.direction;
    splitNode.element = splitEl;

    for (let i = 0; i < tree.children.length; i++) {
      if (i > 0) splitEl.appendChild(this._createSplitHandle(tree.direction, splitEl));
      const childNode = this.buildFromTree(tree.children[i]);
      splitEl.appendChild(childNode.element);
      splitNode.children.push(childNode);
      childNode.parent = splitNode;
    }

    return splitNode;
  }

  createTerminalNode(cwd = null) {
    const spawnCwd = cwd || this.cwd;
    const node = new SplitNode('terminal');

    const wrapper = _el('div', 'terminal-wrapper');
    const termContainer = _el('div', 'terminal-container');

    wrapper.appendChild(this._buildTopBar(node));
    wrapper.appendChild(termContainer);

    node.element = wrapper;
    node.terminal = new TerminalInstance(termContainer, spawnCwd);
    this.terminals.set(node.terminal.id, node);

    bus.emit('terminal:created', { id: node.terminal.id, cwd: spawnCwd });

    wrapper.addEventListener('mousedown', () => {
      this.setActive(node);
    });

    return node;
  }

  // ===== Drag & Drop =====

  setupDrag(handle, sourceNode) {
    handle.addEventListener('mousedown', (e) => {
      if (this.terminals.size < 2) return;
      e.preventDefault();
      e.stopPropagation();

      this._dragSourceId = sourceNode.terminal.id;
      sourceNode.element.classList.add('dragging');
      this._createDropIndicator();

      trackMouse('grabbing',
        (ev) => this._updateDropTarget(ev.clientX, ev.clientY),
        () => {
          sourceNode.element.classList.remove('dragging');
          this._removeDropIndicator();
          if (this._dropTarget && this._dropSide && this._dropTarget !== this._dragSourceId) {
            this.moveTerminal(this._dragSourceId, this._dropTarget, this._dropSide);
          }
          this._dragSourceId = null;
          this._dropTarget = null;
          this._dropSide = null;
        },
      );
    });
  }

  _createDropIndicator() {
    this._dropIndicator = _el('div', 'drop-indicator');
    this.container.appendChild(this._dropIndicator);
  }

  _removeDropIndicator() {
    if (this._dropIndicator) {
      this._dropIndicator.remove();
      this._dropIndicator = null;
    }
    this.container.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));
  }

  _updateDropTarget(mx, my) {
    this._dropTarget = null;
    this._dropSide = null;
    if (this._dropIndicator) this._dropIndicator.style.display = 'none';

    this.container.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));

    for (const [termId, node] of this.terminals) {
      if (termId === this._dragSourceId) continue;

      const rect = node.element.getBoundingClientRect();
      if (mx < rect.left || mx > rect.right || my < rect.top || my > rect.bottom) continue;

      const relX = (mx - rect.left) / rect.width;
      const relY = (my - rect.top) / rect.height;
      const side = detectDropSide(relX, relY);

      this._dropTarget = termId;
      this._dropSide = side;
      node.element.classList.add('drop-hover');

      this._positionIndicator(rect, side);
      return;
    }
  }

  _positionIndicator(rect, side) {
    if (!this._dropIndicator) return;
    const s = this._dropIndicator.style;
    const r = computeIndicatorRect(rect, side);
    s.display = 'block';
    s.left = `${r.left}px`;
    s.top = `${r.top}px`;
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
  }

  moveTerminal(sourceId, targetId, side) {
    const sourceNode = this.terminals.get(sourceId);
    const targetNode = this.terminals.get(targetId);
    if (!sourceNode || !targetNode) return;
    if (sourceNode === targetNode) return;

    const sourceEl = sourceNode.element;
    const targetEl = targetNode.element;

    detachElement(sourceEl);

    if (side === 'center') {
      moveToCenter(sourceEl, targetEl);
    } else {
      const direction = directionFromSide(side);
      const before = isInsertBefore(side);
      const parentEl = targetEl.parentElement;

      if (this._isSameDirectionSplit(parentEl, direction)) {
        insertIntoSplit(sourceEl, targetEl, direction, before, parentEl,
          (d, s) => this._createSplitHandle(d, s),
          (s) => this.equalizeChildren(s));
      } else {
        wrapInNewSplit(sourceEl, targetEl, direction, before, parentEl,
          (d, f) => this._createSplitContainer(d, f),
          (d, s) => this._createSplitHandle(d, s));
      }
    }

    this.fitAll();
    this.setActive(sourceNode);
    bus.emit('layout:changed');
  }

  setActive(node) {
    if (node.type !== 'terminal') return;

    for (const [, n] of this.terminals) {
      n.terminal.cwdPollingPaused = true;
    }
    node.terminal.cwdPollingPaused = false;

    this.container.querySelectorAll('.terminal-wrapper.active').forEach((el) => {
      el.classList.remove('active');
    });

    node.element.classList.add('active');
    this.activeTerminal = node;
    node.terminal.focus();
  }

  splitActive(direction) {
    if (!this.activeTerminal) return;
    this.split(this.activeTerminal, direction);
  }

  focusDirection(dir) {
    if (!this.activeTerminal || this.terminals.size < 2) return;

    const activeRect = this.activeTerminal.element.getBoundingClientRect();
    const activeCenter = {
      cx: activeRect.left + activeRect.width / 2,
      cy: activeRect.top + activeRect.height / 2,
    };

    const candidates = [];
    for (const [id, node] of this.terminals) {
      if (node === this.activeTerminal) continue;
      const rect = node.element.getBoundingClientRect();
      candidates.push({ id, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
    }

    const bestId = findClosestInDirection(activeCenter, candidates, dir);
    if (bestId) this.setActive(this.terminals.get(bestId));
  }

  split(targetNode, direction) {
    const parentEl = targetNode.element.parentElement;

    const sourceCwd = targetNode.terminal ? targetNode.terminal.cwd : this.cwd;
    const newTermNode = this.createTerminalNode(sourceCwd);

    if (this._isSameDirectionSplit(parentEl, direction)) {
      const handle = this._createSplitHandle(direction, parentEl);
      targetNode.element.insertAdjacentElement('afterend', handle);
      handle.insertAdjacentElement('afterend', newTermNode.element);
      this.equalizeChildren(parentEl);
    } else {
      const splitEl = this._createSplitContainer(direction, targetNode.element.style.flex || '1');
      parentEl.replaceChild(splitEl, targetNode.element);

      splitEl.appendChild(targetNode.element);
      splitEl.appendChild(this._createSplitHandle(direction, splitEl));
      splitEl.appendChild(newTermNode.element);
      this.equalizeChildren(splitEl);

      if (this.root === targetNode) {
        const newSplitNode = new SplitNode('split');
        newSplitNode.direction = direction;
        newSplitNode.element = splitEl;
        this.root = newSplitNode;
      }
    }

    this.fitAll();
    this.setActive(newTermNode);
  }

  equalizeChildren(splitEl) {
    const panels = getPanels(splitEl);
    for (const panel of panels) {
      panel.style.flex = '1';
    }
  }

  setupResizeHandle(handle, splitEl, direction) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      trackMouse(RESIZE_CURSOR[direction],
        (ev) => this._doResize(ev, handle, splitEl, direction),
        () => bus.emit('layout:changed'),
      );
    });
  }

  _doResize(e, handle, splitEl, direction) {
    const [panelBefore, panelAfter] = this._adjacentPanels(handle, splitEl);
    if (!panelBefore || !panelAfter) return;

    const { size, start, mouse } = DIRECTION_PROPS[direction];
    const rectBefore = panelBefore.getBoundingClientRect();
    const rectAfter = panelAfter.getBoundingClientRect();

    const totalSize = rectBefore[size] + rectAfter[size];
    const ratio = computeResizeRatio(e[mouse], rectBefore[start], totalSize);

    const totalFlex = (parseFloat(panelBefore.style.flex) || 1) + (parseFloat(panelAfter.style.flex) || 1);
    panelBefore.style.flex = `${totalFlex * ratio}`;
    panelAfter.style.flex = `${totalFlex * (1 - ratio)}`;

    this.fitAll();
  }

  fitAll() {
    requestAnimationFrame(() => {
      for (const [id, node] of this.terminals) {
        if (node.terminal) {
          node.terminal.fit();
        }
      }
    });
  }

  removeTerminal(termId) {
    const node = this.terminals.get(termId);
    if (!node) return;

    node.terminal.dispose();
    this.terminals.delete(termId);
    bus.emit('terminal:removed', { id: termId });

    if (this.terminals.size === 0) {
      this.init();
      return;
    }

    detachElement(node.element);

    const first = this.terminals.values().next().value;
    if (first) this.setActive(first);

    this.fitAll();
  }

  setCwd(cwd) {
    this.cwd = cwd;
  }

  serialize() {
    return serializeLayout(this.container, (el) => this._findTerminalCwd(el), this.cwd);
  }

  serializeElement(el) {
    return serializeElement(el, (e) => this._findTerminalCwd(e), this.cwd);
  }

  applyTheme(theme) {
    for (const [id, node] of this.terminals) {
      node.terminal.terminal.options.theme = theme;
    }
  }

  dispose() {
    for (const [id, node] of this.terminals) {
      node.terminal.dispose();
    }
    this.terminals.clear();
  }
}

registerComponent('TerminalPanel', TerminalPanel);
