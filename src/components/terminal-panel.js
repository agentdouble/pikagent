import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { generateId } from '../utils/id.js';
import { bus } from '../utils/events.js';

const THEME = {
  background: '#1a1a2e',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
  cursorAccent: '#1a1a2e',
  selectionBackground: '#3a3a5e',
  black: '#1a1a2e',
  red: '#ff6b6b',
  green: '#51cf66',
  yellow: '#ffd43b',
  blue: '#74c0fc',
  magenta: '#da77f2',
  cyan: '#66d9e8',
  white: '#e0e0e0',
  brightBlack: '#555577',
  brightRed: '#ff8787',
  brightGreen: '#69db7c',
  brightYellow: '#ffe066',
  brightBlue: '#91d5ff',
  brightMagenta: '#e599f7',
  brightCyan: '#99e9f2',
  brightWhite: '#ffffff',
};

class TerminalInstance {
  constructor(container, cwd) {
    this.id = generateId('term');
    this.container = container;
    this.cwd = cwd;
    this.disposed = false;

    this.terminal = new Terminal({
      theme: THEME,
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

    // Close button (top-right)
    const closeBtn = document.createElement('button');
    closeBtn.className = 'terminal-close-btn';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close terminal';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.removeTerminal(node.terminal.id);
    });
    wrapper.appendChild(closeBtn);

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

    return node;
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
    for (const [id, node] of this.terminals) {
      if (node.terminal) {
        setTimeout(() => node.terminal.fit(), 50);
      }
    }
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

  dispose() {
    for (const [id, node] of this.terminals) {
      node.terminal.dispose();
    }
    this.terminals.clear();
  }
}
