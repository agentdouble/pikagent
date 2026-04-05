/**
 * Tab rendering helpers for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */

import { _el } from './dom.js';
import { contextMenu } from '../components/context-menu.js';

/**
 * Build a single tab element for the given file path.
 *
 * @param {string} filePath
 * @param {Object} file - { name }
 * @param {string|null} activeFile - currently active file path
 * @param {Function} isPinned - (filePath) => boolean
 * @param {Function} isModified - (filePath) => boolean
 * @param {Object} callbacks
 * @param {Function} callbacks.onClose - (filePath) => void
 * @param {Function} callbacks.onActivate - (filePath) => void
 * @param {Function} callbacks.onTogglePin - (filePath) => void
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
  tab.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu.show(e.clientX, e.clientY, [
      { label: pinned ? 'Unpin from all workspaces' : 'Pin across workspaces', action: () => onTogglePin(filePath) },
      { separator: true },
      { label: 'Close', action: () => onClose(filePath) },
    ]);
  });

  return tab;
}

/**
 * Rebuild the entire tabs bar from the current open-files map.
 *
 * @param {HTMLElement} tabsBar
 * @param {Map<string, Object>} openFiles - path → file object
 * @param {string|null} activeFile
 * @param {Function} isPinned
 * @param {Function} isModified
 * @param {Object} callbacks - forwarded to createTabEl
 */
export function renderTabs(tabsBar, openFiles, activeFile, isPinned, isModified, callbacks) {
  tabsBar.replaceChildren();
  for (const [filePath, file] of openFiles) {
    tabsBar.appendChild(createTabEl(filePath, file, activeFile, isPinned, isModified, callbacks));
  }
}
