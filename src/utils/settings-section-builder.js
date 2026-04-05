/**
 * Generic settings section DOM builder.
 * Abstracts the heading + content + action buttons pattern
 * shared across settings-appearance, settings-configs, and settings-keybindings.
 */
import { _el } from './dom.js';

/**
 * Build a settings section and populate the given container.
 *
 * @param {HTMLElement} contentEl - the settings content container (will be cleared)
 * @param {Object} config
 * @param {string}        config.heading  - section title text
 * @param {HTMLElement[]} [config.actions]  - extra elements appended to the heading row (e.g. reset button)
 * @param {HTMLElement[]} [config.content]  - main content elements appended after the heading
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
