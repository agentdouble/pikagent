/* Pure helpers and constants for terminal-panel.
 * No DOM access — only data logic. */

/** Polling interval (ms) for detecting terminal cwd changes. */
export const CWD_POLL_MS = 1500;

/** Visual drag grip character. */
export const DRAG_GRIP = '\u28FF';

/** Map split direction to the resize cursor style. */
export const RESIZE_CURSOR = { horizontal: 'col-resize', vertical: 'row-resize' };

/** Map split direction to rect/mouse property names for resize calculations. */
export const DIRECTION_PROPS = {
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
