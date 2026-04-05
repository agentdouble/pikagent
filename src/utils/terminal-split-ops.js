/**
 * Split-panel layout manipulation helpers for TerminalPanel.
 * Extracted from terminal-panel.js to reduce component size.
 */

import { bus } from './events.js';
import { SplitNode, isSameDirectionSplit, createSplitContainer, equalizeChildren } from './terminal-panel-helpers.js';
import { directionFromSide, isInsertBefore, findClosestInDirection } from './split-helpers.js';
import { detachElement, moveToCenter, insertIntoSplit, wrapInNewSplit } from './split-layout-ops.js';

/**
 * Move a terminal from `sourceId` to a position relative to `targetId`.
 *
 * @param {string} sourceId
 * @param {string} targetId
 * @param {string} side - 'center'|'left'|'right'|'top'|'bottom'
 * @param {Map<string, SplitNode>} terminals
 * @param {Object} callbacks
 * @param {Function} callbacks.createSplitHandle - (direction, splitEl) => HTMLElement
 * @param {Function} callbacks.fitAll - () => void
 * @param {Function} callbacks.setActive - (node) => void
 */
export function moveTerminal(sourceId, targetId, side, terminals, { createSplitHandle, fitAll, setActive }) {
  const sourceNode = terminals.get(sourceId);
  const targetNode = terminals.get(targetId);
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

    if (isSameDirectionSplit(parentEl, direction)) {
      insertIntoSplit(sourceEl, targetEl, direction, before, parentEl,
        (d, s) => createSplitHandle(d, s),
        (s) => equalizeChildren(s));
    } else {
      wrapInNewSplit(sourceEl, targetEl, direction, before, parentEl,
        (d, f) => createSplitContainer(d, f),
        (d, s) => createSplitHandle(d, s));
    }
  }

  fitAll();
  setActive(sourceNode);
  bus.emit('layout:changed');
}

/**
 * Split a target terminal node in the given direction, creating a new terminal.
 *
 * @param {SplitNode} targetNode
 * @param {string} direction - 'horizontal'|'vertical'
 * @param {Object} state - mutable panel state
 * @param {string} state.cwd - default working directory
 * @param {SplitNode|null} state.root - root split node (may be updated)
 * @param {Object} callbacks
 * @param {Function} callbacks.createTerminalNode - (cwd) => SplitNode
 * @param {Function} callbacks.createSplitHandle - (direction, splitEl) => HTMLElement
 * @param {Function} callbacks.fitAll - () => void
 * @param {Function} callbacks.setActive - (node) => void
 * @param {Function} callbacks.setRoot - (node) => void
 */
export function splitTerminal(targetNode, direction, state, { createTerminalNode, createSplitHandle, fitAll, setActive, setRoot }) {
  const parentEl = targetNode.element.parentElement;
  const sourceCwd = targetNode.terminal ? targetNode.terminal.cwd : state.cwd;
  const newTermNode = createTerminalNode(sourceCwd);

  if (isSameDirectionSplit(parentEl, direction)) {
    const handle = createSplitHandle(direction, parentEl);
    targetNode.element.insertAdjacentElement('afterend', handle);
    handle.insertAdjacentElement('afterend', newTermNode.element);
    equalizeChildren(parentEl);
  } else {
    const splitEl = createSplitContainer(direction, targetNode.element.style.flex || '1');
    parentEl.replaceChild(splitEl, targetNode.element);

    splitEl.appendChild(targetNode.element);
    splitEl.appendChild(createSplitHandle(direction, splitEl));
    splitEl.appendChild(newTermNode.element);
    equalizeChildren(splitEl);

    if (state.root === targetNode) {
      const newSplitNode = new SplitNode('split');
      newSplitNode.direction = direction;
      newSplitNode.element = splitEl;
      setRoot(newSplitNode);
    }
  }

  fitAll();
  setActive(newTermNode);
}

/**
 * Focus the nearest terminal in `dir` relative to `activeTerminal`.
 *
 * @param {SplitNode} activeTerminal
 * @param {Map<string, SplitNode>} terminals
 * @param {string} dir - 'left'|'right'|'up'|'down'
 * @param {Function} setActive - (node) => void
 */
export function focusDirection(activeTerminal, terminals, dir, setActive) {
  if (!activeTerminal || terminals.size < 2) return;

  const activeRect = activeTerminal.element.getBoundingClientRect();
  const activeCenter = {
    cx: activeRect.left + activeRect.width / 2,
    cy: activeRect.top + activeRect.height / 2,
  };

  const candidates = [];
  for (const [id, node] of terminals) {
    if (node === activeTerminal) continue;
    const rect = node.element.getBoundingClientRect();
    candidates.push({ id, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2 });
  }

  const bestId = findClosestInDirection(activeCenter, candidates, dir);
  if (bestId) setActive(terminals.get(bestId));
}
