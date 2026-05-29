/**
 * Shared DOM builders for view chrome — header bars and status bars.
 *
 * Several views (flow, skills, usage, git) build a header with the same
 * skeleton: a container, a title on the left, and an actions zone on the
 * right. Two file-viewer renderers build a status bar as a run of
 * `status-item` spans. These helpers factor those two patterns while
 * letting each caller keep its own CSS class prefixes and DOM shape.
 */

import { _el } from './dom-api.js';

/**
 * Build a view header: container + title (left) + actions zone (right).
 *
 * The DOM shape is driven by options so each view keeps its exact markup:
 *   - `wrapLeft: false` (flow, git) → title is a direct child of the header.
 *   - `wrapLeft: true`  (skills, usage) → title (and `leftExtra`) sit inside
 *     a `${baseClass}-header-left` wrapper.
 *
 * @param {{
 *   baseClass: string,
 *   title: string,
 *   titleTag?: string,
 *   titleClass?: string|null,
 *   wrapLeft?: boolean,
 *   leftExtra?: Array<Node>,
 *   actions: Node,
 * }} opts
 *   - baseClass: CSS prefix, e.g. "flow" → header class "flow-header".
 *   - title: text of the title element.
 *   - titleTag: tag for the title element (default "h2").
 *   - titleClass: class for the title; defaults to `${baseClass}-title`.
 *     Pass `null` for no class (git uses a bare span).
 *   - wrapLeft: when true, title + leftExtra are wrapped in `-header-left`.
 *   - leftExtra: extra nodes placed after the title on the left side.
 *   - actions: pre-built node for the right-hand actions zone.
 * @returns {HTMLElement} the header element.
 */
export function buildViewHeader(opts) {
  const {
    baseClass,
    title,
    titleTag = 'h2',
    wrapLeft = false,
    leftExtra = [],
    actions,
  } = opts;
  const titleClass = opts.titleClass === undefined ? `${baseClass}-title` : opts.titleClass;

  const titleEl = _el(titleTag, titleClass, title);
  const header = _el('div', `${baseClass}-header`);

  if (wrapLeft) {
    header.appendChild(_el('div', `${baseClass}-header-left`, titleEl, ...leftExtra));
  } else {
    header.appendChild(titleEl);
    for (const extra of leftExtra) header.appendChild(extra);
  }

  header.appendChild(actions);
  return header;
}

/**
 * Rebuild a status bar as a run of spans, replacing its current children.
 *
 * @param {HTMLElement} statusBar
 * @param {Array<{ text: string, cls?: string, isHint?: boolean }>} items
 *   - text: span text content.
 *   - cls: extra class(es) appended after the base class.
 *   - isHint: when true, the base class is `status-save-hint`; otherwise
 *     `status-item`.
 */
export function renderStatusBar(statusBar, items) {
  if (!statusBar) return;
  statusBar.replaceChildren(
    ...items.map(({ text, cls, isHint }) => {
      const base = isHint ? 'status-save-hint' : 'status-item';
      return _el('span', cls ? `${base} ${cls}` : base, text);
    }),
  );
}
