/**
 * Barrel re-export for the dom-* utility family.
 *
 * Groups every DOM primitive under a single import path so that
 * component files no longer need 3-5 individual dom-*.js imports.
 */

export { _el, _vis } from './dom-core.js';
export { createActionButton, renderButtonBar, buildDomainButtonBar } from './dom-buttons.js';
export { renderList, buildChevronRow, toggleCollapsible, createListItem } from './dom-lists.js';
export {
  createModalOverlay, buildDialogButtons, createDialogBase,
  showPromptDialog, showErrorAlert, showConfirmDialog,
} from './dom-dialogs.js';
export { buildTabButton, buildTabBar } from './dom-tabs.js';
