/**
 * Tab / navigation bar DOM factories.
 *
 *   buildTabButton — single tab element
 *   buildTabBar    — full tab bar with setActive helper
 */
import { _el } from './dom-core.js';

/**
 * Build a single tab/nav element from an `{ id, label }` definition.
 *
 * Applies `itemClass` plus `activeClass` (when the item is currently active)
 * and wires a `click` listener that invokes `onSelect(id)`.
 *
 * Shared building block for tab bars — used directly when a component owns
 * its own container layout (e.g. mode bars that mix tabs with other
 * controls), and internally by `buildTabBar`.
 *
 * @param {{ id: string, label: string }} item
 * @param {{ activeId?: string, onSelect?: (id: string) => void,
 *           tag?: string, itemClass: string, activeClass: string }} opts
 * @returns {HTMLElement}
 */
export function buildTabButton(item, { activeId, onSelect, tag = 'button', itemClass, activeClass }) {
  const isActive = item.id === activeId;
  const el = _el(tag, isActive ? `${itemClass} ${activeClass}` : itemClass, item.label);
  el.addEventListener('click', () => onSelect?.(item.id));
  return el;
}

/**
 * Build a tab/nav bar from a list of `{ id, label }` definitions.
 *
 * Each item becomes an element (`<button>` by default, override via `tag`)
 * carrying `itemClass`, with `activeClass` toggled on the active one. Clicking
 * an item invokes `onSelect(id)`.
 *
 * Returns the bar container plus a `setActive(id)` function that re-applies
 * `activeClass` to the matching item only. Components that need extra side
 * effects on selection (re-rendering a body, etc.) should do that work in
 * `onSelect` and call `setActive` themselves.
 *
 * @param {Array<{ id: string, label: string }>} items
 * @param {{ activeId?: string, onSelect?: (id: string) => void,
 *           barClass?: string, tag?: string,
 *           itemClass: string, activeClass: string }} opts
 * @returns {{ bar: HTMLElement, setActive: (id: string) => void }}
 */
export function buildTabBar(items, { activeId, onSelect, barClass = '', tag = 'button', itemClass, activeClass }) {
  const bar = _el('div', barClass);
  const elements = new Map();
  for (const item of items) {
    const el = buildTabButton(item, { activeId, onSelect, tag, itemClass, activeClass });
    elements.set(item.id, el);
    bar.appendChild(el);
  }
  const setActive = (id) => {
    for (const [itemId, el] of elements) {
      el.classList.toggle(activeClass, itemId === id);
    }
  };
  return { bar, setActive };
}
