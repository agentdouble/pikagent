/**
 * Tab rendering helpers for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */

import { _el } from './dom.js';
import { attachContextMenu } from './context-menu.js';
import { createTabElement } from './tab-renderer.js';

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
function createTabEl(filePath, file, activeFile, isPinned, isModified, callbacks) {
  const { onClose, onActivate, onTogglePin, isMarkdown, getViewMode, onToggleViewMode } = callbacks;
  const pinned = isPinned(filePath);
  const modified = isModified(filePath);
  const markdown = typeof isMarkdown === 'function' ? isMarkdown(filePath) : false;
  const viewMode = typeof getViewMode === 'function' ? getViewMode(filePath) : null;

  // Build prefix elements: optional pin icon + modified indicator
  const prefixEls = [];
  if (pinned) prefixEls.push(_el('span', 'file-tab-pin', '\u{1F4CC}'));
  prefixEls.push(_el('span', 'file-tab-modified', modified ? '\u25CF' : ''));

  const { tabEl } = createTabElement({
    className: 'file-tab',
    isActive: filePath === activeFile,
    name: file.name,
    prefixEls,
    close: { text: '\u00D7', className: 'file-tab-close', onClick: () => onClose(filePath) },
    onClick: () => onActivate(filePath),
    setup: (el) => {
      attachContextMenu(el, () => {
        const items = [];
        if (markdown && onToggleViewMode) {
          items.push({
            label: viewMode === 'preview' ? 'Open as text' : 'Open as preview',
            action: () => onToggleViewMode(filePath),
          });
          items.push({ separator: true });
        }
        items.push({ label: pinned ? 'Unpin from all workspaces' : 'Pin across workspaces', action: () => onTogglePin(filePath) });
        items.push({ separator: true });
        items.push({ label: 'Close', action: () => onClose(filePath) });
        return items;
      });
    },
  });

  return tabEl;
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
