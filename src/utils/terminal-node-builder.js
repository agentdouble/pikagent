/**
 * Terminal node construction helpers for TerminalPanel.
 * Extracted from terminal-panel.js to reduce component size.
 */

import { bus, EVENTS } from './events.js';
import { _el } from './dom-dialogs.js';
import { onClickStopped } from './event-helpers.js';
import { SplitNode, DRAG_GRIP, createSplitContainer } from './terminal-panel-helpers.js';
import { TerminalInstance } from './terminal-instance.js';

/**
 * Build the top-bar DOM element for a terminal wrapper.
 * Wires up the close button and delegates drag setup to a callback.
 *
 * @param {SplitNode} node - the terminal node
 * @param {{ onClose: () => void, setupDrag: (dragHandle: HTMLElement, node: SplitNode) => void }} callbacks
 * @returns {HTMLElement}
 */
export function buildTopBar(node, { onClose, setupDrag }) {
  const topBar = _el('div', 'terminal-top-bar');

  const dragHandle = _el('div', 'terminal-drag-handle', { title: 'Drag to move' });
  dragHandle.appendChild(_el('span', 'drag-grip', { textContent: DRAG_GRIP }));

  const closeBtn = _el('button', 'terminal-close-btn', {
    textContent: '×',
    title: 'Close terminal',
  });
  onClickStopped(closeBtn, () => onClose());

  topBar.appendChild(dragHandle);
  topBar.appendChild(closeBtn);

  setupDrag(dragHandle, node);
  return topBar;
}

/**
 * Create a new terminal node (wrapper + TerminalInstance) and register it.
 *
 * @param {string|null} cwd - working directory for the terminal
 * @param {string} defaultCwd - fallback cwd when `cwd` is null
 * @param {Map<string, SplitNode>} terminals - mutable registry
 * @param {{ buildTopBar: (node: SplitNode) => HTMLElement, onMousedown: (node: SplitNode) => void }} callbacks
 * @param {{ spawn: (cwd: string) => unknown, onData: (id: string, cb: (data: string) => void) => () => void, onExit: (id: string, cb: () => void) => () => void, write: (id: string, data: string) => void, resize: (id: string, cols: number, rows: number) => void, getCwd: (id: string) => Promise<string>, kill: (id: string) => void }} api - injected API methods forwarded to TerminalInstance
 * @returns {SplitNode}
 */
export function createTerminalNode(cwd, defaultCwd, terminals, { buildTopBar: buildTopBarFn, onMousedown }, api) {
  const spawnCwd = cwd || defaultCwd;
  const node = new SplitNode('terminal');

  const wrapper = _el('div', 'terminal-wrapper');
  const termContainer = _el('div', 'terminal-container');

  wrapper.appendChild(buildTopBarFn(node));
  wrapper.appendChild(termContainer);

  node.element = wrapper;
  node.terminal = new TerminalInstance(termContainer, spawnCwd, api);
  terminals.set(node.terminal.id, node);

  /** @fires terminal:created {{ id: string, cwd: string }} */
  bus.emit(EVENTS.TERMINAL_CREATED, { id: node.terminal.id, cwd: spawnCwd });

  wrapper.addEventListener('mousedown', () => onMousedown(node));

  return node;
}

/**
 * Recursively build a split-panel tree from a serialised layout descriptor.
 *
 * @param {{ type: string, cwd?: string, flex?: number, direction?: string, children?: Array<unknown> }} tree - serialized layout node
 * @param {{ createTerminalNode: (cwd?: string) => SplitNode, createSplitHandle: (direction: string, splitEl: HTMLElement) => HTMLElement }} callbacks
 * @returns {SplitNode}
 */
export function buildFromTree(tree, { createTerminalNode: createTerminalNodeFn, createSplitHandle }) {
  if (tree.type === 'terminal') {
    const node = createTerminalNodeFn(tree.cwd);
    node.element.style.flex = String(tree.flex || 1);
    return node;
  }

  const splitEl = createSplitContainer(tree.direction, tree.flex || 1);

  const splitNode = new SplitNode('split');
  splitNode.direction = tree.direction;
  splitNode.element = splitEl;

  for (let i = 0; i < tree.children.length; i++) {
    if (i > 0) splitEl.appendChild(createSplitHandle(tree.direction, splitEl));
    const childNode = buildFromTree(tree.children[i], { createTerminalNode: createTerminalNodeFn, createSplitHandle });
    splitEl.appendChild(childNode.element);
    splitNode.children.push(childNode);
    childNode.parent = splitNode;
  }

  return splitNode;
}
