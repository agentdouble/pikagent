/* Pure helpers and constants for terminal-panel.
 * No DOM access — only data logic. */

/** Polling interval (ms) for detecting terminal cwd changes. */
export const CWD_POLL_MS = 1500;

/** Visual drag grip character. */
export const DRAG_GRIP = '\u28FF';

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
