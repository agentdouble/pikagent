/**
 * DOM rendering utilities.
 *
 * Extracted from dom.js (issue #541) — contains list/bar/row renderers:
 *   renderButtonBar, buildDomainButtonBar, renderList, buildChevronRow
 */
import { _el, createActionButton } from './dom-element.js';

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
 * to true -- the two repetitive steps previously duplicated across renderers.
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
 * Used by file-tree rows, flow-category headers, and tab elements -- any
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
