/**
 * Terminal subsystem facade — single entry-point for the terminal-panel
 * component to access the split-layout, serialization, node-building,
 * drag-drop indicator, and terminal-split APIs.
 *
 * Reduces the import surface of terminal-panel.js from 11 modules
 * down to ~5 (this facade + dom, drag-helpers, component-registry,
 * and the two event modules).
 *
 * @module terminal-subsystem
 */

// ── terminal-panel-helpers ──────────────────────────────────────────
export {
  SplitNode,
  RESIZE_CURSOR,
  isSameDirectionSplit,
  createSplitContainer,
  equalizeChildren,
  doResize,
} from './terminal-panel-helpers.js';

// ── terminal-drop-indicator ─────────────────────────────────────────
export { DropIndicatorManager } from './terminal-drop-indicator.js';

// ── terminal-serializer ─────────────────────────────────────────────
export { serializeLayout, serializeElement } from './terminal-serializer.js';

// ── split-layout ────────────────────────────────────────────────────
export { detachElement } from './split-layout.js';

// ── terminal-node-builder ───────────────────────────────────────────
export { buildTopBar, createTerminalNode, buildFromTree } from './terminal-node-builder.js';

// ── terminal-split ──────────────────────────────────────────────────
export { moveTerminal, splitTerminal, focusDirection } from './terminal-split.js';
