/**
 * Terminal subsystem facade — single entry-point for terminal-panel
 * and board-view components to access terminal infrastructure.
 *
 * Covers the split-layout, serialization, node-building, drag-drop
 * indicator, terminal-split, terminal-events, terminal-dom, and
 * terminal-factory APIs.
 *
 * Reduces the import surface of terminal-panel.js and board-view.js.
 *
 * Extended for issue #384 to reduce coupling in board-view.js.
 *
 * @module terminal-subsystem
 */

// ── terminal-panel-helpers ──────────────────────────────────────────
export {
  SplitNode,
  RESIZE_CURSOR,
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

// ── terminal-events (board-view) ────────────────────────────────────
export {
  onTerminalCreated, onTerminalRemoved, onTerminalExited,
} from './terminal-events.js';

// ── terminal-dom (board-view) ───────────────────────────────────────
export { _el, renderButtonBar, renderList } from './terminal-dom.js';

// ── terminal-factory (board-view) ───────────────────────────────────
export {
  _safeFit, createTerminal, disposeTerminal, disposeTerminalMap,
  setupTerminalAddons, createPtyBoundTerminal,
} from './terminal-factory.js';
