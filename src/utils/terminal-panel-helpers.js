/* Pure helpers and constants for terminal-panel. */
import { _el } from './terminal-dom.js';
import { computeResizeRatio } from './split-primitives.js';
import { getPanels } from './split-layout.js';

/** Polling interval (ms) for detecting terminal cwd changes. */
export const CWD_POLL_MS = 1500;

/** Visual drag grip character. */
export const DRAG_GRIP = '\u28FF';

/** Map split direction to the resize cursor style. */
export const RESIZE_CURSOR = { horizontal: 'col-resize', vertical: 'row-resize' };

/** Map split direction to rect/mouse property names for resize calculations. */
const DIRECTION_PROPS = {
  horizontal: { size: 'width', start: 'left', mouse: 'clientX' },
  vertical: { size: 'height', start: 'top', mouse: 'clientY' },
};

/**
 * Lightweight node in the split-panel tree.
 * Direction: 'horizontal' splits left/right, 'vertical' splits top/bottom.
 */
export class SplitNode {
  constructor(type, parent = null) {
    this.type = type; // 'terminal' | 'split'
    this.parent = parent;
    this.direction = null; // 'horizontal' | 'vertical'
    this.children = []; // SplitNode[]
    this.terminal = null; // TerminalInstance (only if type === 'terminal')
    this.element = null;
  }
}

// ===== Pure DOM helpers =====

/** Check if an element is a split container with the given direction. */
export function isSameDirectionSplit(el, direction) {
  return el?.classList.contains('split-container') && el.classList.contains(`split-${direction}`);
}

/** Create a new split container element. */
export function createSplitContainer(direction, flex = '1') {
  const el = _el('div', `split-container split-${direction}`);
  el.style.flex = String(flex);
  return el;
}

/** Find the adjacent non-handle panels around a split handle. */
function adjacentPanels(handle, splitEl) {
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

/** Equalize flex values for all direct panel children of a split container. */
export function equalizeChildren(splitEl) {
  for (const panel of getPanels(splitEl)) {
    panel.style.flex = '1';
  }
}

/** Perform resize calculation on two adjacent panels. */
export function doResize(e, handle, splitEl, direction, fitAllFn) {
  const [panelBefore, panelAfter] = adjacentPanels(handle, splitEl);
  if (!panelBefore || !panelAfter) return;

  const { size, start, mouse } = DIRECTION_PROPS[direction];
  const rectBefore = panelBefore.getBoundingClientRect();
  const rectAfter = panelAfter.getBoundingClientRect();

  const totalSize = rectBefore[size] + rectAfter[size];
  const ratio = computeResizeRatio(e[mouse], rectBefore[start], totalSize);

  const totalFlex = (parseFloat(panelBefore.style.flex) || 1) + (parseFloat(panelAfter.style.flex) || 1);
  panelBefore.style.flex = `${totalFlex * ratio}`;
  panelAfter.style.flex = `${totalFlex * (1 - ratio)}`;

  fitAllFn();
}
