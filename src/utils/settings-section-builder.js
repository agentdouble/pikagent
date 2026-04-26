/**
 * Generic settings section DOM builder.
 * Abstracts the heading + content + action buttons pattern
 * shared across settings-appearance, settings-configs, and settings-keybindings.
 */
import { _el, renderButtonBar } from './settings-dom.js';
import { createAsyncHandler } from './event-helpers.js';

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

/**
 * Higher-level settings section builder that iterates an items array through
 * a renderItem callback, then delegates to {@link createSettingsSection}.
 *
 * This extracts the repeated pattern found across settings-keybindings and
 * settings-configs where a list of domain objects is mapped to DOM rows
 * inside a wrapper element.
 *
 * @param {HTMLElement} contentEl - the settings content container (will be cleared)
 * @param {{
 *   heading: string,
 *   items: unknown[],
 *   renderItem: (item: unknown) => HTMLElement,
 *   listClass?: string,
 *   actions?: HTMLElement[],
 *   before?: HTMLElement[],
 *   after?: HTMLElement[],
 * }} opts
 * @returns {HTMLElement} the heading element
 */
export function buildSettingsSection(contentEl, { heading, items, renderItem, listClass, actions, before = [], after = [] }) {
  const list = _el('div', listClass || null);
  for (const item of items) {
    list.appendChild(renderItem(item));
  }

  return createSettingsSection(contentEl, {
    heading,
    actions,
    content: [...before, list, ...after],
  });
}

/**
 * Create action handler maps from declarative action descriptors.
 *
 * Extracts the repeated pattern in settings-configs where both
 * `_createConfigActions` and `_createBottomActions` build a handlers object
 * mapping action keys to async-wrapped callbacks, then feed it to
 * `renderButtonBar`.
 *
 * Each entry in `actions` must have an `action` key. The corresponding
 * handler is looked up in `handlerDefs`. When a `handlerDefs` entry is
 * a plain function it is used as-is; when it is an object with `apiCall`
 * (and optional `guard`) it is wrapped via `createAsyncHandler` with the
 * shared `onSuccess` callback.
 *
 * @param {{
 *   containerClass: string,
 *   actions: Array<{ action: string, label?: string, title?: string, cls?: string, hideWhen?: string }>,
 *   handlerDefs: Record<string, Function | { apiCall: Function, guard?: () => boolean }>,
 *   onSuccess?: () => void,
 *   filter?: (desc: object) => boolean,
 * }} opts
 * @returns {HTMLElement}
 */
export function createActionBar({ containerClass, actions, handlerDefs, onSuccess, filter }) {
  const handlers = {};
  for (const [key, def] of Object.entries(handlerDefs)) {
    if (typeof def === 'function') {
      handlers[key] = def;
    } else {
      handlers[key] = createAsyncHandler(
        { guard: def.guard, onSuccess },
        def.apiCall,
      );
    }
  }

  const configs = filter ? actions.filter(filter) : actions;
  return renderButtonBar({ containerClass, configs, handlers });
}
