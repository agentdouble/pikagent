import { emitTerminalRemoved } from '../utils/terminal-events.js';
import { emitLayoutChanged } from '../utils/workspace-events.js';
import { _el } from '../utils/terminal-dom.js';
import { setupDragHandler, setupResizeHandler } from '../utils/drag-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import {
  SplitNode, RESIZE_CURSOR, doResize,
  DropIndicatorManager,
  serializeLayout, serializeElement,
  detachElement,
  buildTopBar,
  createTerminalNode as createTerminalNodeHelper,
  buildFromTree as buildFromTreeHelper,
  moveTerminal as moveTerminalHelper,
  splitTerminal,
  focusDirection as focusDirectionHelper,
} from '../utils/terminal-subsystem.js';
import { terminalFacade } from '../utils/terminal-services.js';

export class TerminalPanel {
  constructor(container, cwd) {
    this.container = container;
    this.cwd = cwd;
    this._initState();
    this._initApi();
    this._initDragState();
    this.init();
  }

  _initState() {
    this.root = null;
    this.activeTerminal = null;
    this.terminals = new Map();
  }

  _initApi() {
    // Injected API methods forwarded to TerminalInstance
    this._terminalApi = {
      openExternal: terminalFacade.openExternal,
      homedir: terminalFacade.homedir,
      openPath: terminalFacade.openPath,
      ptyWrite: terminalFacade.ptyWrite,
      ptyOnData: terminalFacade.ptyOnData,
      ptyOnExit: terminalFacade.ptyOnExit,
      ptyCreate: terminalFacade.ptyCreate,
      ptyGetCwd: terminalFacade.ptyGetCwd,
      ptyResize: terminalFacade.ptyResize,
      ptyKill: terminalFacade.ptyKill,
    };
  }

  _initDragState() {
    // Drag and drop state
    this._dragSourceId = null;
    this._drop = new DropIndicatorManager(this.container);
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
    }, this._terminalApi);
  }

  // ===== Drag & Drop =====

  setupDrag(handle, sourceNode) {
    setupDragHandler(handle, {
      guard: () => this.terminals.size >= 2,
      stopPropagation: true,
      cursor: 'grabbing',
      bodyClass: 'dragging',
      onStart: () => {
        this._dragSourceId = sourceNode.terminal.id;
        sourceNode.element.classList.add('dragging');
        this._drop.create();
      },
      onMove: (ev) => this._drop.update(ev.clientX, ev.clientY, this.terminals, this._dragSourceId),
      onEnd: () => {
        sourceNode.element.classList.remove('dragging');
        const { targetId, side } = this._drop;
        this._drop.remove();
        if (targetId && side && targetId !== this._dragSourceId) {
          this.moveTerminal(this._dragSourceId, targetId, side);
        }
        this._dragSourceId = null;
      },
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
    setupResizeHandler(handle, {
      cursor: RESIZE_CURSOR[direction],
      onMove: (ev) => doResize(ev, handle, splitEl, direction, () => this.fitAll()),
      /** @fires layout:changed {undefined} — resize complete */
      onDone: () => emitLayoutChanged(),
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
    /** @fires terminal:removed {{ id: string }} */
    emitTerminalRemoved({ id: termId });

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
