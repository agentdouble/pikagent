/**
 * Button-related DOM factories.
 *
 *   createActionButton   — single button factory
 *   renderButtonBar      — row of buttons from config descriptors
 *   buildDomainButtonBar — domain-specific button bar with class prefix
 */
import { _el } from './dom-core.js';
import { onClickStopped } from './event-helpers.js';

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
