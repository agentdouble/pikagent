/**
 * Drag cleanup helpers — extracted from flow-category-renderer.js
 * to break the circular dependency with flow-card-setup.js.
 *
 * @see https://github.com/agentdouble/pikagent/issues/337
 */

/**
 * Remove all elements matching `selector` from `container`.
 * Shared by _updateDropIndicator / _setupCategoryDropZone / cleanupAllDragState.
 *
 * @param {Document|HTMLElement} container
 * @param {string} selector
 */
export function clearIndicators(container, selector) {
  for (const el of container.querySelectorAll(selector)) {
    el.remove();
  }
}

/**
 * Remove all drag state indicators from the document.
 */
export function cleanupAllDragState() {
  clearIndicators(document, '.flow-drop-indicator');
  for (const el of document.querySelectorAll('.flow-drop-zone-active')) {
    el.classList.remove('flow-drop-zone-active');
  }
}
