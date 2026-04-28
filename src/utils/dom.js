/**
 * Core DOM utilities.
 *
 * This module keeps only the essential DOM factories:
 *   _el, createActionButton, renderButtonBar, renderList
 *
 * The following helpers have been extracted to dedicated modules — import
 * them directly from there instead of going through this file:
 *   - createModalOverlay, showPromptDialog,
 *     showConfirmDialog                     → ./dom-dialogs.js
 *   - setupInlineInput, startInlineRename   → ./form-helpers.js
 *   - setupDropZone                         → ./drop-zone-helpers.js
 *   - setupKeyboardShortcuts                → ./keyboard-helpers.js
 *   - _safeFit                              → ./terminal-factory.js
 *   - createSelect                          → ./flow-modal-helpers.js (private)
 *   - positionInViewport                    → ./context-menu.js (private)
 *
 * Domain facades reduce fan-in — prefer importing from these where applicable:
 *   - terminal-dom.js   (terminal-node-builder, terminal-drop-indicator, board-view, …)
 *   - tab-dom.js        (tab-bar-renderer, tab-renderer, tab-lifecycle, …)
 *   - workspace-dom.js  (workspace-layout, workspace-resize, sidebar-manager, usage-view, …)
 *   - flow-dom.js       (flow-card-renderer, flow-card-setup, …)
 *   - file-dom.js       (file-tree-renderer, file-tree-drop, diff-viewer, …)
 *   - git-dom.js        (worktree-flow, worktree-dialog, open-pr-flow)
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


