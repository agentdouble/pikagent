import { bus } from '../utils/events.js';
import { _el } from '../utils/dom.js';
import { trackMouse } from '../utils/drag-helpers.js';
import {
  SplitNode, RESIZE_CURSOR,
  isSameDirectionSplit, createSplitContainer, equalizeChildren, doResize,
} from '../utils/terminal-panel-helpers.js';
import { DropIndicatorManager } from '../utils/terminal-drop-indicator.js';
import { registerComponent } from '../utils/component-registry.js';
import { serializeLayout, serializeElement } from '../utils/terminal-serializer.js';
import { detachElement } from '../utils/split-layout-ops.js';
import {
  buildTopBar,
  createTerminalNode as createTerminalNodeHelper,
  buildFromTree as buildFromTreeHelper,
} from '../utils/terminal-node-builder.js';
import { moveTerminal as moveTerminalHelper, splitTerminal, focusDirection as focusDirectionHelper } from '../utils/terminal-split-ops.js';

export class TerminalPanel {
  constructor(container, cwd) {
    this.container = container;
    this.cwd = cwd;
    this.root = null;
    this.activeTerminal = null;
    this.terminals = new Map();

    // Drag and drop state
    this._dragSourceId = null;
    this._drop = new DropIndicatorManager(container);

    this.init();
  }

  // ===== DOM Helpers =====

  _createSplitHandle(direction, splitEl) {
    const handle = _el('div', `split-handle split-handle-${direction}`);
    this.setupResizeHandle(handle, splitEl, direction);
    return handle;
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
    return buildTopBar(node, {
      onClose: () => this.removeTerminal(node.terminal.id),
      setupDrag: (handle, n) => this.setupDrag(handle, n),
    });
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
    return buildFromTreeHelper(tree, {
      createTerminalNode: (cwd) => this.createTerminalNode(cwd),
      createSplitHandle: (d, s) => this._createSplitHandle(d, s),
    });
  }

  createTerminalNode(cwd = null) {
    return createTerminalNodeHelper(cwd, this.cwd, this.terminals, {
      buildTopBar: (node) => this._buildTopBar(node),
      onMousedown: (node) => this.setActive(node),
    });
  }

  // ===== Drag & Drop =====

  setupDrag(handle, sourceNode) {
    handle.addEventListener('mousedown', (e) => {
      if (this.terminals.size < 2) return;
      e.preventDefault();
      e.stopPropagation();

      this._dragSourceId = sourceNode.terminal.id;
      sourceNode.element.classList.add('dragging');
      this._drop.create();

      trackMouse('grabbing',
        (ev) => this._drop.update(ev.clientX, ev.clientY, this.terminals, this._dragSourceId),
        () => {
          sourceNode.element.classList.remove('dragging');
          const { targetId, side } = this._drop;
          this._drop.remove();
          if (targetId && side && targetId !== this._dragSourceId) {
            this.moveTerminal(this._dragSourceId, targetId, side);
          }
          this._dragSourceId = null;
        },
      );
    });
  }

  moveTerminal(sourceId, targetId, side) {
    moveTerminalHelper(sourceId, targetId, side, this.terminals, {
      createSplitHandle: (d, s) => this._createSplitHandle(d, s),
      fitAll: () => this.fitAll(),
      setActive: (node) => this.setActive(node),
    });
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
    focusDirectionHelper(this.activeTerminal, this.terminals, dir, (node) => this.setActive(node));
  }

  split(targetNode, direction) {
    splitTerminal(targetNode, direction, { cwd: this.cwd, root: this.root }, {
      createTerminalNode: (cwd) => this.createTerminalNode(cwd),
      createSplitHandle: (d, s) => this._createSplitHandle(d, s),
      fitAll: () => this.fitAll(),
      setActive: (node) => this.setActive(node),
      setRoot: (node) => { this.root = node; },
    });
  }

  setupResizeHandle(handle, splitEl, direction) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      trackMouse(RESIZE_CURSOR[direction],
        (ev) => doResize(ev, handle, splitEl, direction, () => this.fitAll()),
        () => bus.emit('layout:changed'),
      );
    });
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
