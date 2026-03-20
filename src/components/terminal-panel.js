import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { generateId } from '../utils/id.js';
import { bus } from '../utils/events.js';
import { getTerminalTheme } from '../utils/terminal-themes.js';

class TerminalInstance {
  constructor(container, cwd) {
    this.id = generateId('term');
    this.container = container;
    this.cwd = cwd;
    this.disposed = false;

    this.terminal = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.3,
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

    // Let Ctrl+Tab / Shift+Ctrl+Tab bubble up to the shortcut manager
    this.terminal.attachCustomKeyEventHandler((e) => {
      if (e.key === 'Tab' && e.ctrlKey) return false;
      return true;
    });

    this.terminal.open(container);
    this.fit();

    this.terminal.onData((data) => {
      window.api.pty.write({ id: this.id, data });
    });

    this.unsubData = window.api.pty.onData(({ id, data }) => {
      if (id === this.id && !this.disposed) {
        this.terminal.write(data);
      }
    });

    this.unsubExit = window.api.pty.onExit(({ id }) => {
      if (id === this.id) {
        bus.emit('terminal:exited', { id: this.id });
      }
    });

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);

    this.spawn();
    this.startCwdPolling();
  }

  async spawn() {
    const { cols, rows } = this.terminal;
    await window.api.pty.create({ id: this.id, cwd: this.cwd, cols, rows });
  }

  startCwdPolling() {
    this.cwdPollTimer = setInterval(async () => {
      if (this.disposed) return;
      const cwd = await window.api.pty.getCwd({ id: this.id });
      if (cwd && cwd !== this.cwd) {
        this.cwd = cwd;
        bus.emit('terminal:cwdChanged', { id: this.id, cwd });
      }
    }, 1500);
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
    this.disposed = true;
    if (this.cwdPollTimer) clearInterval(this.cwdPollTimer);
    this.resizeObserver.disconnect();
    if (this.unsubData) this.unsubData();
    if (this.unsubExit) this.unsubExit();
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

  init() {
    this.container.innerHTML = '';
    this.container.className = 'terminal-panel';

    const node = this.createTerminalNode();
    this.root = node;
    this.container.appendChild(node.element);
    this.setActive(node);
  }

  restoreFromTree(tree) {
    // Dispose existing terminals created by init()
    for (const [id, node] of this.terminals) {
      node.terminal.dispose();
    }
    this.terminals.clear();

    this.container.innerHTML = '';
    this.container.className = 'terminal-panel';

    const node = this.buildFromTree(tree);
    this.root = node;
    this.container.appendChild(node.element);

    // Activate the first terminal
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

    // Split node
    const splitEl = document.createElement('div');
    splitEl.className = `split-container split-${tree.direction}`;
    splitEl.style.flex = String(tree.flex || 1);

    const splitNode = new SplitNode('split');
    splitNode.direction = tree.direction;
    splitNode.element = splitEl;

    for (let i = 0; i < tree.children.length; i++) {
      if (i > 0) {
        const handle = document.createElement('div');
        handle.className = `split-handle split-handle-${tree.direction}`;
        splitEl.appendChild(handle);
        this.setupResizeHandle(handle, splitEl, tree.direction);
      }
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
    const wrapper = document.createElement('div');
    wrapper.className = 'terminal-wrapper';

    // Top bar with drag handle and close button
    const topBar = document.createElement('div');
    topBar.className = 'terminal-top-bar';

    const dragHandle = document.createElement('div');
    dragHandle.className = 'terminal-drag-handle';
    dragHandle.title = 'Drag to move';
    dragHandle.innerHTML = '<span class="drag-grip">⠿</span>';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'terminal-close-btn';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close terminal';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeTerminal(node.terminal.id);
    });

    topBar.appendChild(dragHandle);
    topBar.appendChild(closeBtn);
    wrapper.appendChild(topBar);

    const termContainer = document.createElement('div');
    termContainer.className = 'terminal-container';
    wrapper.appendChild(termContainer);

    node.element = wrapper;
    node.terminal = new TerminalInstance(termContainer, spawnCwd);
    this.terminals.set(node.terminal.id, node);

    bus.emit('terminal:created', { id: node.terminal.id, cwd: spawnCwd });

    wrapper.addEventListener('mousedown', () => {
      this.setActive(node);
    });

    // --- Drag setup on the handle ---
    this.setupDrag(dragHandle, node);

    return node;
  }

  // ===== Drag & Drop =====

  setupDrag(handle, sourceNode) {
    handle.addEventListener('mousedown', (e) => {
      if (this.terminals.size < 2) return; // nothing to reorder
      e.preventDefault();
      e.stopPropagation();

      this._dragSourceId = sourceNode.terminal.id;
      sourceNode.element.classList.add('dragging');
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      // Create floating indicator
      this._createDropIndicator();

      const onMouseMove = (ev) => {
        this._updateDropTarget(ev.clientX, ev.clientY);
      };

      const onMouseUp = (ev) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        sourceNode.element.classList.remove('dragging');
        this._removeDropIndicator();

        if (this._dropTarget && this._dropSide && this._dropTarget !== this._dragSourceId) {
          this.moveTerminal(this._dragSourceId, this._dropTarget, this._dropSide);
        }

        this._dragSourceId = null;
        this._dropTarget = null;
        this._dropSide = null;
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  _createDropIndicator() {
    this._dropIndicator = document.createElement('div');
    this._dropIndicator.className = 'drop-indicator';
    this.container.appendChild(this._dropIndicator);
  }

  _removeDropIndicator() {
    if (this._dropIndicator) {
      this._dropIndicator.remove();
      this._dropIndicator = null;
    }
    // Remove all hover highlights
    this.container.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));
  }

  _updateDropTarget(mx, my) {
    this._dropTarget = null;
    this._dropSide = null;
    if (this._dropIndicator) this._dropIndicator.style.display = 'none';

    // Remove previous highlights
    this.container.querySelectorAll('.drop-hover').forEach((el) => el.classList.remove('drop-hover'));

    for (const [termId, node] of this.terminals) {
      if (termId === this._dragSourceId) continue;

      const rect = node.element.getBoundingClientRect();
      if (mx < rect.left || mx > rect.right || my < rect.top || my > rect.bottom) continue;

      // Determine which side (edge zone = 30% from each edge)
      const relX = (mx - rect.left) / rect.width;
      const relY = (my - rect.top) / rect.height;

      let side;
      const edgeThreshold = 0.3;

      if (relX < edgeThreshold && relX < relY && relX < (1 - relY)) {
        side = 'left';
      } else if (relX > (1 - edgeThreshold) && (1 - relX) < relY && (1 - relX) < (1 - relY)) {
        side = 'right';
      } else if (relY < edgeThreshold) {
        side = 'top';
      } else if (relY > (1 - edgeThreshold)) {
        side = 'bottom';
      } else {
        side = 'center'; // swap
      }

      this._dropTarget = termId;
      this._dropSide = side;
      node.element.classList.add('drop-hover');

      // Position the indicator
      if (this._dropIndicator) {
        this._dropIndicator.style.display = 'block';
        const pad = 2;
        if (side === 'left') {
          this._dropIndicator.style.left = `${rect.left}px`;
          this._dropIndicator.style.top = `${rect.top + pad}px`;
          this._dropIndicator.style.width = `${rect.width / 2}px`;
          this._dropIndicator.style.height = `${rect.height - pad * 2}px`;
        } else if (side === 'right') {
          this._dropIndicator.style.left = `${rect.left + rect.width / 2}px`;
          this._dropIndicator.style.top = `${rect.top + pad}px`;
          this._dropIndicator.style.width = `${rect.width / 2}px`;
          this._dropIndicator.style.height = `${rect.height - pad * 2}px`;
        } else if (side === 'top') {
          this._dropIndicator.style.left = `${rect.left + pad}px`;
          this._dropIndicator.style.top = `${rect.top}px`;
          this._dropIndicator.style.width = `${rect.width - pad * 2}px`;
          this._dropIndicator.style.height = `${rect.height / 2}px`;
        } else if (side === 'bottom') {
          this._dropIndicator.style.left = `${rect.left + pad}px`;
          this._dropIndicator.style.top = `${rect.top + rect.height / 2}px`;
          this._dropIndicator.style.width = `${rect.width - pad * 2}px`;
          this._dropIndicator.style.height = `${rect.height / 2}px`;
        } else {
          // center = full
          this._dropIndicator.style.left = `${rect.left + pad}px`;
          this._dropIndicator.style.top = `${rect.top + pad}px`;
          this._dropIndicator.style.width = `${rect.width - pad * 2}px`;
          this._dropIndicator.style.height = `${rect.height - pad * 2}px`;
        }
      }
      return;
    }
  }

  moveTerminal(sourceId, targetId, side) {
    const sourceNode = this.terminals.get(sourceId);
    const targetNode = this.terminals.get(targetId);
    if (!sourceNode || !targetNode) return;
    if (sourceNode === targetNode) return;

    const sourceEl = sourceNode.element;
    const targetEl = targetNode.element;
    const sourceFlex = sourceEl.style.flex;

    // --- Detach source from its current container ---
    this._detachElement(sourceEl);

    // --- Insert at target ---
    if (side === 'center') {
      // Swap positions: put source where target is, target where source was
      // Since source is already detached, just insert source before target, then done
      // Actually for center, let's just place source before target in the same container
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
        // Insert into existing split container
        const handle = document.createElement('div');
        handle.className = `split-handle split-handle-${direction}`;
        this.setupResizeHandle(handle, parentEl, direction);

        if (insertBefore) {
          targetEl.insertAdjacentElement('beforebegin', sourceEl);
          sourceEl.insertAdjacentElement('afterend', handle);
        } else {
          targetEl.insertAdjacentElement('afterend', handle);
          handle.insertAdjacentElement('afterend', sourceEl);
        }
        this.equalizeChildren(parentEl);
      } else {
        // Wrap target in a new split container
        const splitEl = document.createElement('div');
        splitEl.className = `split-container split-${direction}`;
        splitEl.style.flex = targetEl.style.flex || '1';

        parentEl.replaceChild(splitEl, targetEl);
        targetEl.style.flex = '1';
        sourceEl.style.flex = '1';

        const handle = document.createElement('div');
        handle.className = `split-handle split-handle-${direction}`;
        this.setupResizeHandle(handle, splitEl, direction);

        if (insertBefore) {
          splitEl.appendChild(sourceEl);
          splitEl.appendChild(handle);
          splitEl.appendChild(targetEl);
        } else {
          splitEl.appendChild(targetEl);
          splitEl.appendChild(handle);
          splitEl.appendChild(sourceEl);
        }
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
      // Remove one adjacent handle
      const handles = Array.from(parentEl.querySelectorAll(':scope > .split-handle'));
      if (handles.length > 0) {
        handles[handles.length - 1].remove();
      }

      const remainingPanels = Array.from(parentEl.children).filter(
        (c) => !c.classList.contains('split-handle')
      );

      if (remainingPanels.length === 1) {
        // Unwrap: replace split container with sole remaining child
        const survivor = remainingPanels[0];
        const grandParent = parentEl.parentElement;
        if (grandParent) {
          survivor.style.flex = parentEl.style.flex || '1';
          grandParent.replaceChild(survivor, parentEl);
          // Recursively check if grandParent also needs unwrapping
          this._cleanupContainer(grandParent);
        }
      } else if (remainingPanels.length === 0) {
        parentEl.remove();
      }
    }
  }

  _cleanupContainer(el) {
    if (!el || !el.classList.contains('split-container')) return;
    const panels = Array.from(el.children).filter(
      (c) => !c.classList.contains('split-handle')
    );
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

    // Remove active from all
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

      // Check if the candidate is in the right direction
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

    // Inherit cwd from the terminal being split
    const sourceCwd = targetNode.terminal ? targetNode.terminal.cwd : this.cwd;
    const newTermNode = this.createTerminalNode(sourceCwd);

    if (parentIsSameDirection) {
      // Flat: insert new terminal + handle right after target in existing container
      const handle = document.createElement('div');
      handle.className = `split-handle split-handle-${direction}`;
      this.setupResizeHandle(handle, parentEl, direction);

      targetNode.element.insertAdjacentElement('afterend', handle);
      handle.insertAdjacentElement('afterend', newTermNode.element);

      // Equalize all panels in this container
      this.equalizeChildren(parentEl);
    } else {
      // Wrap: create a new split container
      const splitEl = document.createElement('div');
      splitEl.className = `split-container split-${direction}`;
      splitEl.style.flex = targetNode.element.style.flex || '1';

      parentEl.replaceChild(splitEl, targetNode.element);

      splitEl.appendChild(targetNode.element);

      const handle = document.createElement('div');
      handle.className = `split-handle split-handle-${direction}`;
      splitEl.appendChild(handle);
      this.setupResizeHandle(handle, splitEl, direction);

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

  // Set all panel children of a split container to equal flex
  equalizeChildren(splitEl) {
    const panels = Array.from(splitEl.children).filter(
      (c) => !c.classList.contains('split-handle')
    );
    for (const panel of panels) {
      panel.style.flex = '1';
    }
  }

  setupResizeHandle(handle, splitEl, direction) {
    const onMouseMove = (e) => {
      const panels = Array.from(splitEl.children).filter(
        (c) => !c.classList.contains('split-handle')
      );
      if (panels.length < 2) return;

      // Find which two panels this handle sits between
      const allChildren = Array.from(splitEl.children);
      const handleIndex = allChildren.indexOf(handle);
      // Panel before handle and panel after handle
      let panelBefore = null;
      let panelAfter = null;
      for (let i = handleIndex - 1; i >= 0; i--) {
        if (!allChildren[i].classList.contains('split-handle')) {
          panelBefore = allChildren[i];
          break;
        }
      }
      for (let i = handleIndex + 1; i < allChildren.length; i++) {
        if (!allChildren[i].classList.contains('split-handle')) {
          panelAfter = allChildren[i];
          break;
        }
      }
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
      ratio = Math.max(0.1, Math.min(0.9, ratio));

      // Get current total flex for these two panels
      const flexBefore = parseFloat(panelBefore.style.flex) || 1;
      const flexAfter = parseFloat(panelAfter.style.flex) || 1;
      const totalFlex = flexBefore + flexAfter;

      panelBefore.style.flex = `${totalFlex * ratio}`;
      panelAfter.style.flex = `${totalFlex * (1 - ratio)}`;

      this.fitAll();
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      bus.emit('layout:changed');
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
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

    const parentEl = node.element.parentElement;

    if (parentEl && parentEl.classList.contains('split-container')) {
      // Remove the terminal element
      node.element.remove();

      // Remove one adjacent handle
      const handles = parentEl.querySelectorAll('.split-handle');
      if (handles.length > 0) {
        // Remove the last handle (one more handle than needed now)
        handles[handles.length - 1].remove();
      }

      // Count remaining panels
      const remainingPanels = Array.from(parentEl.children).filter(
        (c) => !c.classList.contains('split-handle')
      );

      if (remainingPanels.length === 1) {
        // Unwrap: replace the split container with the sole remaining child
        const survivor = remainingPanels[0];
        const grandParent = parentEl.parentElement;
        survivor.style.flex = parentEl.style.flex || '1';
        grandParent.replaceChild(survivor, parentEl);
      } else {
        // Equalize remaining panels
        this.equalizeChildren(parentEl);
      }
    } else {
      node.element.remove();
    }

    const first = this.terminals.values().next().value;
    if (first) this.setActive(first);

    this.fitAll();
  }

  setCwd(cwd) {
    this.cwd = cwd;
  }

  serialize() {
    // Serialize purely from the DOM to avoid root/node sync issues
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
