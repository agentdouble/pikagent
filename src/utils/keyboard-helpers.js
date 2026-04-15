/**
 * Keyboard helpers — extracted from dom.js to reduce coupling.
 *
 * Provides utilities for wiring up keyboard shortcuts on DOM elements.
 * Delegates to onKeyAction from event-helpers.
 */

import { onKeyAction } from './event-helpers.js';

/**
 * Wire up Enter / Escape keyboard shortcuts on an element.
 * Delegates to onKeyAction from event-helpers.
 * @param {HTMLElement} el
 * @param {{ onEnter?: (e: KeyboardEvent) => void, onEscape?: (e: KeyboardEvent) => void }} handlers
 * @returns {() => void} cleanup — removes the listener
 */
export function setupKeyboardShortcuts(el, { onEnter, onEscape } = {}) {
  return onKeyAction(el, { onEnter, onEscape });
}
