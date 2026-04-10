/**
 * Tab rendering helpers for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */

import { _el } from './dom.js';
import { attachContextMenu } from './context-menu.js';

/**
 * Build a single tab element for the given file path.
 *
 * @param {string} filePath
 * @param {{ name: string }} file
 * @param {string|null} activeFile - currently active file path
 * @param {(filePath: string) => boolean} isPinned
 * @param {(filePath: string) => boolean} isModified
 * @param {{ onClose: (filePath: string) => void, onActivate: (filePath: string) => void, onTogglePin: (filePath: string) => void }} callbacks
 * @returns {HTMLElement}
 */
export function createTabEl(filePath, file, activeFile, isPinned, isModified, { onClose, onActivate, onTogglePin }) {
  const tab = _el('div', 'file-tab');
  if (filePath === activeFile) tab.classList.add('active');

  const pinned = isPinned(filePath);
  const modified = isModified(filePath);

  if (pinned) tab.appendChild(_el('span', 'file-tab-pin', '\u{1F4CC}'));
  tab.appendChild(_el('span', 'file-tab-modified', modified ? '\u25CF' : ''));
  tab.appendChild(_el('span', null, file.name));

  const close = _el('span', 'file-tab-close', '\u00D7');
  close.addEventListener('click', (e) => { e.stopPropagation(); onClose(filePath); });
  tab.appendChild(close);

  tab.addEventListener('click', () => onActivate(filePath));
  attachContextMenu(tab, () => [
    { label: pinned ? 'Unpin from all workspaces' : 'Pin across workspaces', action: () => onTogglePin(filePath) },
    { separator: true },
    { label: 'Close', action: () => onClose(filePath) },
  ]);

  return tab;
}

/**
 * Rebuild the entire tabs bar from the current open-files map.
 *
 * @param {HTMLElement} tabsBar
 * @param {Map<string, { name: string }>} openFiles - path -> file object
 * @param {string|null} activeFile
 * @param {(filePath: string) => boolean} isPinned
 * @param {(filePath: string) => boolean} isModified
 * @param {{ onClose: (filePath: string) => void, onActivate: (filePath: string) => void, onTogglePin: (filePath: string) => void }} callbacks
 */
export function renderTabs(tabsBar, openFiles, activeFile, isPinned, isModified, callbacks) {
  tabsBar.replaceChildren();
  for (const [filePath, file] of openFiles) {
    tabsBar.appendChild(createTabEl(filePath, file, activeFile, isPinned, isModified, callbacks));
  }
}
