/**
 * DOM utilities — barrel re-export.
 *
 * This file re-exports every public helper from the focused sub-modules
 * so that existing consumers (`import { _el } from './dom.js'`) keep working
 * without any change.
 *
 * Sub-modules:
 *   dom-core.js    — _el, _vis (primitives)
 *   dom-buttons.js — createActionButton, renderButtonBar, buildDomainButtonBar
 *   dom-tabs.js    — buildTabButton, buildTabBar
 *   dom-lists.js   — renderList, buildChevronRow, toggleCollapsible, createListItem
 *
 * Previously extracted helpers (unchanged):
 *   - createModalOverlay, showPromptDialog,
 *     showConfirmDialog                     → ./dom-dialogs.js
 *   - setupInlineInput, startInlineRename   → ./form-helpers.js
 *   - setupDropZone                         → ./drop-zone-helpers.js
 *   - onKeyAction (was setupKeyboardShortcuts) → ./event-helpers.js
 *   - _safeFit                              → ./terminal-factory.js
 *   - createSelect                          → ./flow-modal-helpers.js (private)
 *   - positionInViewport                    → ./context-menu.js (private)
 */

export { _el, _vis } from './dom-core.js';
export { createActionButton, renderButtonBar, buildDomainButtonBar } from './dom-buttons.js';
export { buildTabButton, buildTabBar } from './dom-tabs.js';
export { renderList, buildChevronRow, toggleCollapsible, createListItem } from './dom-lists.js';
