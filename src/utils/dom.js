/**
 * Core DOM utilities.
 *
 * This module keeps only the essential DOM factories:
 *   _el, _vis, createActionButton, renderButtonBar, renderList,
 *   buildTabButton, buildTabBar
 *
 * The following helpers have been extracted to dedicated modules — import
 * them directly from there instead of going through this file:
 *   - createModalOverlay, showPromptDialog,
 *     showConfirmDialog                     → ./dom-dialogs.js
 *   - setupInlineInput, startInlineRename   → ./form-helpers.js
 *   - setupDropZone                         → ./drop-zone-helpers.js
 *   - onKeyAction (was setupKeyboardShortcuts) → ./event-helpers.js
 *   - _safeFit                              → ./terminal-factory.js
 *   - createSelect                          → ./flow-modal-helpers.js (private)
 *   - positionInViewport                    → ./context-menu.js (private)
 *
 * All consumers now import directly from this module (dom-facades.js and
 * flow-dom.js were removed as redundant pass-through re-exports — see #462).
 */
import { onClickStopped } from './event-helpers.js';

/**
 * Create a DOM element.
 *
 * Supports two calling conventions:
 *   _el('div', { className: 'c', textContent: 't', onClick: fn }, child…)  — object attrs
 *   _el('div', 'className', 'text' | { prop: v } | child…)               — positional
 *
 * @param {string} tag
 * @param {Record<string, unknown>|string|null} [attrsOrClass]
 * @param {...(Node|string|Record<string, unknown>|null|false)} children
 */
export function _el(tag, attrsOrClass, ...children) {
  const el = document.createElement(tag);
  if (typeof attrsOrClass === 'string') {
    if (attrsOrClass) el.className = attrsOrClass;
  } else if (attrsOrClass) {
    for (const [k, v] of Object.entries(attrsOrClass)) {
      if (k === 'className') el.className = v;
      else if (k === 'textContent') el.textContent = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else el[k] = v;
    }
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child && typeof child === 'object' && !(child instanceof Node)) Object.assign(el, child);
    else if (child) el.appendChild(child);
  }
  return el;
}

/**
 * Create a <button> element with common options.
 *
 * Unified factory that accepts both legacy (`label`, `className`) and
 * short-form (`text`, `cls`) parameter names so every call-site can
 * converge on a single helper.
 *
 * Supports text labels, child nodes (e.g. SVG icons), and optional
 * stopPropagation wrapping on the click handler.
 *
 * @param {{ text?: string, label?: string, title?: string,
 *           cls?: string, className?: string,
 *           onClick?: (e: MouseEvent) => void, childNode?: Node,
 *           stopPropagation?: boolean }} opts
 * @returns {HTMLButtonElement}
 */
export function createActionButton({ text, label = '', title, cls, className, onClick, childNode, stopPropagation = false } = {}) {
  const content = text ?? label;
  const cssClass = cls ?? className ?? '';
  const btn = _el('button', cssClass, content);
  if (title) btn.title = title;
  if (childNode) btn.appendChild(childNode);
  if (onClick) {
    if (stopPropagation) onClickStopped(btn, onClick);
    else btn.addEventListener('click', onClick);
  }
  return btn;
}

/**
 * Render a row of buttons from an array of config descriptors.
 *
 * Each entry in `configs` is an object with button properties
 * (text, label, title, className, childNode, stopPropagation) plus an
 * `action` key that maps into the `handlers` object.
 *
 * @param {{ containerClass: string,
 *           configs: Array<{ action: string, text?: string, label?: string,
 *                            title?: string, cls?: string, className?: string,
 *                            childNode?: Node, stopPropagation?: boolean }>,
 *           handlers: Record<string, (e: MouseEvent) => void> }} opts
 * @returns {HTMLElement}
 */
export function renderButtonBar({ containerClass, configs, handlers }) {
  const bar = _el('div', containerClass);
  for (const cfg of configs) {
    bar.appendChild(createActionButton({
      text: cfg.text || cfg.label || '',
      title: cfg.title,
      cls: cfg.className || cfg.cls,
      childNode: cfg.childNode,
      stopPropagation: cfg.stopPropagation ?? false,
      onClick: handlers[cfg.action],
    }));
  }
  return bar;
}

/**
 * Build a domain-specific button bar from a list of action definitions.
 * Each action's `cls` is prefixed with `baseClass` and `stopPropagation` is set
 * to true — the two repetitive steps previously duplicated across renderers.
 *
 * @param {string} baseClass   - CSS class prefix for each button (e.g. "flow-card-btn")
 * @param {string} containerClass - CSS class for the bar container
 * @param {Array<{text: string, title: string, action: string, cls?: string}>} actions
 * @param {Record<string, () => void>} handlers
 * @returns {HTMLElement}
 */
export function buildDomainButtonBar(baseClass, containerClass, actions, handlers) {
  const configs = actions.map(({ text, title, action, cls }) => ({
    text,
    title,
    cls: cls ? `${baseClass} ${cls}` : baseClass,
    action,
    stopPropagation: true,
  }));
  return renderButtonBar({ containerClass, configs, handlers });
}

/**
 * Clear a container and populate it by calling `renderItem` for each item.
 * @param {HTMLElement} container
 * @param {Array<unknown>} items
 * @param {(item: unknown, index: number) => HTMLElement|null} renderItem
 */
/**
 * Toggle element visibility by setting display style.
 * @param {HTMLElement} el
 * @param {boolean} show
 * @param {string} [display=''] - Display value when visible (e.g. 'flex', 'block').
 */
export function _vis(el, show, display = '') {
  el.style.display = show ? display : 'none';
}

export function renderList(container, items, renderItem) {
  container.replaceChildren();
  for (let i = 0; i < items.length; i++) {
    const el = renderItem(items[i], i);
    if (el) container.appendChild(el);
  }
}

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

