/**
 * DOM re-exports for the settings domain.
 *
 * Settings components (settings-modal, settings-appearance, settings-configs,
 * settings-keybindings, settings-update, settings-section-builder) import DOM
 * primitives through this facade instead of reaching into the core dom.js hub.
 */
export { _el, createActionButton, renderButtonBar } from './dom.js';
