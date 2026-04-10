/**
 * Workspace Cleanup — tab disposal utilities.
 *
 * Extracted from workspace-layout.js to break the circular dependency
 * between workspace-layout.js and workspace-serializer.js (issue #94).
 *
 * @typedef {{ tabs: Map<string, import('./tab-manager-helpers.js').WorkspaceTab>, setActiveTabId: (id: string|null) => void }} DisposeAllTabsDeps
 */

import { TAB_DISPOSABLES } from './tab-manager-helpers.js';

// ── Tab disposal ──

/**
 * Dispose a single tab — call dispose() on all disposable sub-components
 * and remove the layout element from the DOM.
 * @param {import('./tab-manager-helpers.js').WorkspaceTab} tab
 */
export function disposeTab(tab) {
  for (const key of TAB_DISPOSABLES) if (tab[key]) tab[key].dispose();
  if (tab.layoutElement) tab.layoutElement.remove();
}

/**
 * Dispose all tabs and clear the tab map.
 * @param {DisposeAllTabsDeps} deps
 */
export function disposeAllTabs({ tabs, setActiveTabId }) {
  for (const [id, tab] of [...tabs]) {
    disposeTab(tab);
    tabs.delete(id);
  }
  setActiveTabId(null);
}
