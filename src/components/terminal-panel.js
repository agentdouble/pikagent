import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { generateId } from '../utils/id.js';
import { bus } from '../utils/events.js';
import { getTerminalTheme } from '../utils/terminal-themes.js';
import { FilePathLinkProvider } from '../utils/file-link-provider.js';

/* ── Constants ────────────────────────────────────────────────── */
const FONT_SIZE = 13;
const LINE_HEIGHT = 1.3;
const CWD_POLL_MS = 1500;
const EDGE_THRESHOLD = 0.3;
const INDICATOR_PAD = 2;
const MIN_RESIZE_RATIO = 0.1;
const MAX_RESIZE_RATIO = 0.9;
const DRAG_GRIP = '⠿';

/* ── DOM helper ───────────────────────────────────────────────── */
function _el(tag, cls, props) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (props) Object.assign(el, props);
  return el;
}

class TerminalInstance {
  constructor(container, cwd) {
    this.id = generateId('term');
    this.container = container;
    this.cwd = cwd;
    this.disposed = false;

    this.terminal = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: FONT_SIZE,
      lineHeight: LINE_HEIGHT,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(new WebLinksAddon((e, url) => {
      e.preventDefault();
      window.api.shell.openExternal(url);
    }));
    this.terminal.registerLinkProvider(new FilePathLinkProvider(this.terminal, () => this.cwd));

    // Let Ctrl+Tab / Shift+Ctrl+Tab bubble up to the shortcut manager
    this.terminal.attachCustomKeyEventHandler((e) => {
      if (e.key === 'Tab' && e.ctrlKey) return false;
      return true;
    });

    this.terminal.open(container);
    this.fit();

    this.terminal.onData((data) => {
      if (!this.disposed) window.api.pty.write({ id: this.id, data });
    });

    this.unsubData = window.api.pty.onData(this.id, (data) => {
      if (!this.disposed) this.terminal.write(data);
    });

    this.unsubExit = window.api.pty.onExit(this.id, () => {
      bus.emit('terminal:exited', { id: this.id });
    });

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);

    this.cwdPollingPaused = false;
    this.spawn();
    this.startCwdPolling();
  }

  async spawn() {
    const { cols, rows } = this.terminal;
    await window.api.pty.create({ id: this.id, cwd: this.cwd, cols, rows });
  }

  startCwdPolling() {
    this.cwdPollTimer = setInterval(async () => {
      if (this.disposed || this.cwdPollingPaused) return;
      const cwd = await window.api.pty.getCwd({ id: this.id });
      if (cwd && cwd !== this.cwd) {
        this.cwd = cwd;
        bus.emit('terminal:cwdChanged', { id: this.id, cwd });
      }
    }, CWD_POLL_MS);
  }

  fit() {
    try {
      this.fitAddon.fit();
      const { cols, rows } = this.terminal;
      window.api.pty.resize({ id: this.id, cols, rows });
    } catch {}
  }

  focus() {
    this.terminal.focus();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.cwdPollTimer) {
      clearInterval(this.cwdPollTimer);
      this.cwdPollTimer = null;
    }
    this.resizeObserver.disconnect();
    if (this.unsubData) { this.unsubData(); this.unsubData = null; }
    if (this.unsubExit) { this.unsubExit(); this.unsubExit = null; }
    window.api.pty.kill({ id: this.id });
    this.terminal.dispose();
  }
}

// Direction: 'horizontal' splits left/right, 'vertical' splits top/bottom
class SplitNode {
  constructor(type, parent = null) {
    this.type = type; // 'terminal' | 'split'
    this.parent = parent;
    this.direction = null; // 'horizontal' | 'vertical'
    this.children = []; // SplitNode[]
    this.terminal = null; // TerminalInstance (only if type === 'terminal')
    this.element = null;
  }
}

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

  /** Return non-handle child panels of a split container. */
  _getPanels(splitEl) {
    return Array.from(splitEl.children).filter(
      (c) => !c.classList.contains('split-handle'),
    );
  }

  /** Create a split-handle element wired for resizing. */
  _createSplitHandle(direction, splitEl) {
    const handle = _el('div', `split-handle split-handle-${direction}`);
    this.setupResizeHandle(handle, splitEl, direction);
    return handle;
  }

  /** Create a split-container div with direction and flex. */
  _createSplitContainer(direction, flex = '1') {
    const el = _el('div', `split-container split-${direction}`);
    el.style.flex = String(flex);
    return el;
  }

  /** Reset container to blank terminal-panel state. */
  _resetContainer() {
    this.container.innerHTML = '';
    this.container.className = 'terminal-panel';
  }

  /** Build the top bar (drag handle + close button) for a terminal node. */
  _buildTopBar(node) {
    const topBar = _el('div', 'terminal-top-bar');

    const dragHandle = _el('div', 'terminal-drag-handle', { title: 'Drag to move' });
    dragHandle.innerHTML = `<span class="drag-grip">${DRAG_GRIP}</span>`;

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

  /**
   * Start a mouse-drag session: set cursor, throttle moves via RAF, clean up on mouseup.
   */
  _trackMouse(cursor, onMove, onDone) {
    let rafPending = false;
    const move = (e) => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => { rafPending = false; onMove(e); });
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      onDone();
    };
    document.body.style.cursor = cursor;
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  /** Return the two panels adjacent to a split-handle: [before, after]. */
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

      this._trackMouse('grabbing',
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

      let side;
      if (relX < EDGE_THRESHOLD && relX < relY && relX < (1 - relY)) {
        side = 'left';
      } else if (relX > (1 - EDGE_THRESHOLD) && (1 - relX) < relY && (1 - relX) < (1 - relY)) {
        side = 'right';
      } else if (relY < EDGE_THRESHOLD) {
        side = 'top';
      } else if (relY > (1 - EDGE_THRESHOLD)) {
        side = 'bottom';
      } else {
        side = 'center';
      }

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
    s.display = 'block';
    const pad = INDICATOR_PAD;
    const isHoriz = side === 'left' || side === 'right';
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;

    if (side === 'center') {
      s.left = `${rect.left + pad}px`;
      s.top = `${rect.top + pad}px`;
      s.width = `${rect.width - pad * 2}px`;
      s.height = `${rect.height - pad * 2}px`;
    } else if (isHoriz) {
      s.left = `${rect.left + (side === 'right' ? halfW : 0)}px`;
      s.top = `${rect.top + pad}px`;
      s.width = `${halfW}px`;
      s.height = `${rect.height - pad * 2}px`;
    } else {
      s.left = `${rect.left + pad}px`;
      s.top = `${rect.top + (side === 'bottom' ? halfH : 0)}px`;
      s.width = `${rect.width - pad * 2}px`;
      s.height = `${halfH}px`;
    }
  }

  moveTerminal(sourceId, targetId, side) {
    const sourceNode = this.terminals.get(sourceId);
    const targetNode = this.terminals.get(targetId);
    if (!sourceNode || !targetNode) return;
    if (sourceNode === targetNode) return;

    const sourceEl = sourceNode.element;
    const targetEl = targetNode.element;

    this._detachElement(sourceEl);

    if (side === 'center') {
      targetEl.parentElement.insertBefore(sourceEl, targetEl);
      sourceEl.style.flex = targetEl.style.flex;
    } else {
      const direction = (side === 'left' || side === 'right') ? 'horizontal' : 'vertical';
      const insertBefore = (side === 'left' || side === 'top');

      const parentEl = targetEl.parentElement;
      const parentIsSameDirection =
        parentEl &&
        parentEl.classList.contains('split-container') &&
        parentEl.classList.contains(`split-${direction}`);

      if (parentIsSameDirection) {
        const handle = this._createSplitHandle(direction, parentEl);
        if (insertBefore) {
          targetEl.insertAdjacentElement('beforebegin', sourceEl);
          sourceEl.insertAdjacentElement('afterend', handle);
        } else {
          targetEl.insertAdjacentElement('afterend', handle);
          handle.insertAdjacentElement('afterend', sourceEl);
        }
        this.equalizeChildren(parentEl);
      } else {
        const splitEl = this._createSplitContainer(direction, targetEl.style.flex || '1');
        parentEl.replaceChild(splitEl, targetEl);
        targetEl.style.flex = '1';
        sourceEl.style.flex = '1';

        const [first, second] = insertBefore ? [sourceEl, targetEl] : [targetEl, sourceEl];
        splitEl.appendChild(first);
        splitEl.appendChild(this._createSplitHandle(direction, splitEl));
        splitEl.appendChild(second);
      }
    }

    this.fitAll();
    this.setActive(sourceNode);
    bus.emit('layout:changed');
  }

  _detachElement(el) {
    const parentEl = el.parentElement;
    if (!parentEl) return;

    el.remove();

    if (parentEl.classList.contains('split-container')) {
      const handles = Array.from(parentEl.querySelectorAll(':scope > .split-handle'));
      if (handles.length > 0) {
        handles[handles.length - 1].remove();
      }

      const remainingPanels = this._getPanels(parentEl);

      if (remainingPanels.length === 1) {
        const survivor = remainingPanels[0];
        const grandParent = parentEl.parentElement;
        if (grandParent) {
          survivor.style.flex = parentEl.style.flex || '1';
          grandParent.replaceChild(survivor, parentEl);
          this._unwrapIfSingle(grandParent);
        }
      } else if (remainingPanels.length === 0) {
        parentEl.remove();
      }
    }
  }

  _unwrapIfSingle(el) {
    if (!el || !el.classList.contains('split-container')) return;
    const panels = this._getPanels(el);
    if (panels.length === 1) {
      const survivor = panels[0];
      const parent = el.parentElement;
      if (parent) {
        survivor.style.flex = el.style.flex || '1';
        parent.replaceChild(survivor, el);
      }
    }
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
    const cx = activeRect.left + activeRect.width / 2;
    const cy = activeRect.top + activeRect.height / 2;

    let best = null;
    let bestDist = Infinity;

    for (const [id, node] of this.terminals) {
      if (node === this.activeTerminal) continue;

      const rect = node.element.getBoundingClientRect();
      const tx = rect.left + rect.width / 2;
      const ty = rect.top + rect.height / 2;

      let inDirection = false;
      if (dir === 'left' && tx < cx) inDirection = true;
      if (dir === 'right' && tx > cx) inDirection = true;
      if (dir === 'up' && ty < cy) inDirection = true;
      if (dir === 'down' && ty > cy) inDirection = true;
      if (!inDirection) continue;

      const dist = Math.hypot(tx - cx, ty - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = node;
      }
    }

    if (best) this.setActive(best);
  }

  split(targetNode, direction) {
    const parentEl = targetNode.element.parentElement;
    const parentIsSameDirection =
      parentEl &&
      parentEl.classList.contains('split-container') &&
      parentEl.classList.contains(`split-${direction}`);

    const sourceCwd = targetNode.terminal ? targetNode.terminal.cwd : this.cwd;
    const newTermNode = this.createTerminalNode(sourceCwd);

    if (parentIsSameDirection) {
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
    const panels = this._getPanels(splitEl);
    for (const panel of panels) {
      panel.style.flex = '1';
    }
  }

  setupResizeHandle(handle, splitEl, direction) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      this._trackMouse(cursor,
        (ev) => this._doResize(ev, handle, splitEl, direction),
        () => bus.emit('layout:changed'),
      );
    });
  }

  _doResize(e, handle, splitEl, direction) {
      const [panelBefore, panelAfter] = this._adjacentPanels(handle, splitEl);
      if (!panelBefore || !panelAfter) return;

      const rectBefore = panelBefore.getBoundingClientRect();
      const rectAfter = panelAfter.getBoundingClientRect();

      let totalSize, mousePos, startPos;
      if (direction === 'horizontal') {
        totalSize = rectBefore.width + rectAfter.width;
        startPos = rectBefore.left;
        mousePos = e.clientX;
      } else {
        totalSize = rectBefore.height + rectAfter.height;
        startPos = rectBefore.top;
        mousePos = e.clientY;
      }

      let ratio = (mousePos - startPos) / totalSize;
      ratio = Math.max(MIN_RESIZE_RATIO, Math.min(MAX_RESIZE_RATIO, ratio));

      const flexBefore = parseFloat(panelBefore.style.flex) || 1;
      const flexAfter = parseFloat(panelAfter.style.flex) || 1;
      const totalFlex = flexBefore + flexAfter;

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

    this._detachElement(node.element);

    const first = this.terminals.values().next().value;
    if (first) this.setActive(first);

    this.fitAll();
  }

  setCwd(cwd) {
    this.cwd = cwd;
  }

  serialize() {
    const rootEl = this.container.firstElementChild;
    if (!rootEl) return { type: 'terminal', cwd: this.cwd, flex: 1 };
    return this.serializeElement(rootEl);
  }

  serializeElement(el) {
    if (el.classList.contains('split-container')) {
      const direction = el.classList.contains('split-horizontal') ? 'horizontal' : 'vertical';
      const children = [];

      for (const child of el.children) {
        if (child.classList.contains('split-handle')) continue;
        children.push(this.serializeElement(child));
      }

      return {
        type: 'split',
        direction,
        flex: parseFloat(el.style.flex) || 1,
        children,
      };
    }

    if (el.classList.contains('terminal-wrapper')) {
      let termCwd = this.cwd;
      for (const [id, tNode] of this.terminals) {
        if (tNode.element === el) {
          termCwd = tNode.terminal.cwd;
          break;
        }
      }
      return {
        type: 'terminal',
        cwd: termCwd,
        flex: parseFloat(el.style.flex) || 1,
      };
    }

    return { type: 'terminal', cwd: this.cwd, flex: 1 };
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
