/**
 * Core DOM utilities — barrel re-export.
 *
 * This module has been split into domain-specific sub-modules (issue #541):
 *   - ./dom-element.js     (_el, createActionButton)
 *   - ./dom-rendering.js   (renderButtonBar, buildDomainButtonBar, renderList, buildChevronRow)
 *   - ./dom-visibility.js  (_vis)
 *
 * All exports are re-exported here so that the 49 existing consumers
 * keep working without any import-path changes.
 *
 * New code should import directly from the sub-module it needs.
 *
 * The following helpers were previously extracted to dedicated modules —
 * import them directly from there:
 *   - createModalOverlay, showPromptDialog,
 *     showConfirmDialog                     → ./dom-dialogs.js
 *   - setupInlineInput, startInlineRename   → ./form-helpers.js
 *   - setupDropZone                         → ./drop-zone-helpers.js
 *   - onKeyAction (was setupKeyboardShortcuts) → ./event-helpers.js
 *   - _safeFit                              → ./terminal-factory.js
 *   - createSelect                          → ./flow-modal-helpers.js (private)
 *   - positionInViewport                    → ./context-menu.js (private)
 */

export { _el, createActionButton } from './dom-element.js';
export { renderButtonBar, buildDomainButtonBar, renderList, buildChevronRow } from './dom-rendering.js';
export { _vis } from './dom-visibility.js';
