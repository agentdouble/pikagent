/**
 * Drop-zone helpers — extracted from dom.js to reduce coupling.
 *
 * Provides utilities for wiring up drag-and-drop zones.
 */

import { onDragEvents } from './event-helpers.js';

/**
 * Wire up dragover / dragleave / drop on an element.
 *
 * @param {HTMLElement} el
 * @param {{ hoverClass?: string,
 *           onDrop: (e: DragEvent) => void,
 *           onDragOver?: (e: DragEvent) => void,
 *           onDragLeave?: (e: DragEvent) => void,
 *           accept?: (e: DragEvent) => boolean }} opts
 */
export function setupDropZone(el, { hoverClass = 'drag-over', onDrop, onDragOver, onDragLeave, accept }) {
  onDragEvents(el, {
    onDragOver: (e) => {
      if (accept && !accept(e)) return;
      e.preventDefault();
      el.classList.add(hoverClass);
      if (onDragOver) onDragOver(e);
    },
    onDragLeave: (e) => {
      if (onDragLeave) {
        onDragLeave(e);
      } else {
        el.classList.remove(hoverClass);
      }
    },
    onDrop: (e) => {
      e.preventDefault();
      el.classList.remove(hoverClass);
      onDrop(e);
    },
  });
}
