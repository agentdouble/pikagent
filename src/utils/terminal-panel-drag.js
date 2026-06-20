/**
 * Terminal panel drag/drop & resize facade.
 * Encapsulates drag-helpers, terminal-drop-indicator, split-layout,
 * resize primitives and the layout-changed event so that
 * terminal-panel.js does not need to import them directly.
 */
import { setupDragHandler, setupResizeHandler } from './drag-helpers.js';
import { DropIndicatorManager } from './terminal-drop-indicator.js';
import { detachElement } from './split-layout.js';
import { RESIZE_CURSOR, doResize } from './terminal-panel-helpers.js';
import { emitLayoutChanged } from './workspace-events.js';

export {
  setupDragHandler,
  setupResizeHandler,
  DropIndicatorManager,
  detachElement,
  RESIZE_CURSOR,
  doResize,
  emitLayoutChanged,
};
