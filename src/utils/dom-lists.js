/**
 * List / row DOM factories.
 *
 *   renderList        — clear & populate a container from an item array
 *   buildChevronRow   — chevron + label row (file-tree, categories, etc.)
 *   toggleCollapsible — toggle a key in a Set + optional DOM updates
 *   createListItem    — generic list-item element factory
 */
import { _el } from './dom-core.js';
import { onClickStopped } from './event-helpers.js';

/**
 * Clear a container and populate it by calling `renderItem` for each item.
 * @param {HTMLElement} container
 * @param {Array<unknown>} items
 * @param {(item: unknown, index: number) => HTMLElement|null} renderItem
 */
export function renderList(container, items, renderItem) {
  container.replaceChildren();
  for (let i = 0; i < items.length; i++) {
    const el = renderItem(items[i], i);
    if (el) container.appendChild(el);
  }
}

/**
 * Build a row containing an optional chevron span and a name span.
 *
 * Used by file-tree rows, flow-category headers, and tab elements — any
 * place that needs the common "chevron + label" or "label-only" pattern.
 *
 * When `containerClass` is provided, a wrapper `<div>` is returned as `row`.
 * An optional `depth` + `computeIndent` pair applies padding-left for
 * tree-style indentation.
 *
 * When `chevronClass` is omitted or null, no chevron element is created and
 * the returned `chevron` field is `null`.
 *
 * @param {{ chevronClass?: string|null, nameClass?: string|null,
 *           name: string, chevronText?: string, containerClass?: string,
 *           depth?: number, computeIndent?: (depth: number) => number,
 *           prefixChildren?: HTMLElement[],
 *           afterChevronChildren?: HTMLElement[],
 *           extraChildren?: HTMLElement[] }} opts
 * @returns {{ chevron: HTMLElement|null, name: HTMLElement, row?: HTMLElement }}
 */
export function buildChevronRow(opts) {
  const chevron = opts.chevronClass
    ? _el('span', { className: opts.chevronClass, textContent: opts.chevronText || '' })
    : null;
  const name = _el('span', { className: opts.nameClass || '', textContent: opts.name });

  if (opts.containerClass) {
    const style = (opts.depth != null && opts.computeIndent)
      ? { paddingLeft: `${opts.computeIndent(opts.depth)}px` }
      : undefined;
    const parts = [
      ...(opts.prefixChildren || []),
      ...(chevron ? [chevron] : []),
      ...(opts.afterChevronChildren || []),
      name,
      ...(opts.extraChildren || []),
    ];
    const row = _el('div', {
      className: opts.containerClass,
      ...(style && { style }),
    }, ...parts);
    return { chevron, name, row };
  }

  return { chevron, name };
}

/**
 * Toggle a key in a Set and optionally update chevron text and a CSS class
 * on a DOM element.
 *
 * Extracts the repeated expand/collapse pattern shared by file-tree
 * section headers, file-tree directory rows, and flow-category groups.
 *
 * The Set semantics are *caller-defined*: the Set may track expanded keys
 * (file-tree directories) or collapsed keys (flow categories).  This
 * function simply toggles membership and returns whether the key is now
 * present (`true`) or absent (`false`).
 *
 * @param {Set<string>} set - the Set to toggle the key in
 * @param {string} key - the key to toggle
 * @param {HTMLElement|null} [chevronEl] - chevron element whose textContent is updated
 * @param {{ presentText: string, absentText: string }} [chevronTexts]
 *   Text to set on the chevron: `presentText` when the key is now *in* the Set,
 *   `absentText` when it has been removed.
 * @param {{ el?: HTMLElement, presentCls?: string, absentCls?: string }} [domToggle]
 *   `presentCls` is toggled *on* when the key is present, *off* when absent.
 *   `absentCls` is toggled *on* when the key is absent, *off* when present.
 * @returns {boolean} `true` if the key is now in the Set, `false` otherwise
 */
export function toggleCollapsible(set, key, chevronEl, chevronTexts, domToggle) {
  const wasPresent = set.has(key);
  if (wasPresent) set.delete(key);
  else set.add(key);
  const isPresent = !wasPresent;

  if (chevronEl && chevronTexts) {
    chevronEl.textContent = isPresent ? chevronTexts.presentText : chevronTexts.absentText;
  }

  if (domToggle?.el) {
    if (domToggle.presentCls) {
      domToggle.el.classList.toggle(domToggle.presentCls, isPresent);
    }
    if (domToggle.absentCls) {
      domToggle.el.classList.toggle(domToggle.absentCls, !isPresent);
    }
  }

  return isPresent;
}

/**
 * Generic factory for creating a list-item element with optional children
 * and click handler.
 *
 * Captures the shared pattern across context-menu items, settings rows,
 * and similar list-like UI elements: create a container div, append
 * child elements, and optionally wire a click handler.
 *
 * @param {{
 *   cls: string,
 *   children?: Array<HTMLElement|Node>,
 *   onClick?: (e: MouseEvent) => void,
 *   stopPropagation?: boolean,
 * }} opts
 * @returns {HTMLElement}
 */
export function createListItem({ cls, children = [], onClick, stopPropagation = false }) {
  const el = _el('div', cls);
  for (const child of children) {
    if (child) el.appendChild(child);
  }
  if (onClick) {
    if (stopPropagation) onClickStopped(el, onClick);
    else el.addEventListener('click', onClick);
  }
  return el;
}
