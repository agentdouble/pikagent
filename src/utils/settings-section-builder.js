/**
 * Generic settings section DOM builder.
 * Abstracts the heading + content + action buttons pattern
 * shared across settings-appearance, settings-configs, and settings-keybindings.
 */
import { _el } from './dom-dialogs.js';

/**
 * Build a settings section and populate the given container.
 *
 * @param {HTMLElement} contentEl - the settings content container (will be cleared)
 * @param {{ heading: string, actions?: HTMLElement[], content?: HTMLElement[] }} config
 * @returns {HTMLElement} the heading element that was created
 */
export function createSettingsSection(contentEl, { heading, actions = [], content = [] }) {
  contentEl.replaceChildren();

  const headingEl = _el('div', 'settings-section-header');
  headingEl.appendChild(_el('h3', null, heading));
  for (const el of actions) headingEl.appendChild(el);
  contentEl.appendChild(headingEl);

  for (const el of content) contentEl.appendChild(el);

  return headingEl;
}
