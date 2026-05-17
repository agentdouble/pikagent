/**
 * Terminal panel drag/drop facade.
 * Encapsulates drag-helpers, terminal-drop-indicator, and split-layout
 * to reduce coupling in terminal-panel.js.
 */
import { setupDragHandler, setupResizeHandler } from './drag-helpers.js';
import { DropIndicatorManager } from './terminal-drop-indicator.js';
import { detachElement } from './split-layout.js';

export { setupDragHandler, setupResizeHandler, DropIndicatorManager, detachElement };
