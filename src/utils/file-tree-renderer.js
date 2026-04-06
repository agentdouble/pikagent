/**
 * Directory-entry rendering helpers for FileTree.
 * Extracted from file-tree.js to reduce component size.
 */

import { bus } from './events.js';
import { _el } from './dom.js';
import { computeIndent, CHEVRON_EXPANDED, CHEVRON_COLLAPSED } from './file-tree-helpers.js';
import { buildFileContextItems, buildDirContextItems } from './file-tree-context-menu.js';
import { attachContextMenu } from './context-menu.js';

/**
 * Build a generic row element with a chevron and name span.
 *
 * @param {Object} entry - { name }
 * @param {number} depth
 * @returns {{ row: HTMLElement, chevron: HTMLElement, name: HTMLElement }}
 */
export function buildRow(entry, depth) {
  const chevron = _el('span', { className: 'file-tree-chevron' });
  const name = _el('span', { className: 'file-tree-name', textContent: entry.name });
  const row = _el('div', {
    className: 'file-tree-item',
    style: { paddingLeft: `${computeIndent(depth)}px` },
  }, chevron, name);
  return { row, chevron, name };
}

/**
 * Render a single directory entry into `parentEl`, with expand/collapse
 * and context-menu behaviour wired up.
 *
 * @param {Object} entry - { name, path, isDirectory }
 * @param {HTMLElement} parentEl
 * @param {number} depth
 * @param {Set<string>} expandedDirs
 * @param {Object} callbacks
 * @param {Function} callbacks.setupDropZone - (el, targetDir) => void
 * @param {Function} callbacks.expandDir - (dirPath, childContainer, chevron, depth, expandedDirs) => Promise
 * @param {Function} callbacks.collapseDir - (dirPath, childContainer, chevron, expandedDirs) => void
 * @param {Function} callbacks.renderDir - (dirPath, parentEl, depth, expandedDirs) => Promise
 * @param {Function} callbacks.findRootCwd - (entryPath) => string
 * @param {Function} callbacks.promptRename - (path, nameEl) => void
 * @param {Function} callbacks.promptNewEntry - (dirPath, contentEl, depth, expandedDirs, type) => void
 */
export async function renderDirEntry(entry, parentEl, depth, expandedDirs, callbacks) {
  const { setupDropZone, expandDir, collapseDir, findRootCwd, promptRename, promptNewEntry } = callbacks;
  const { row, chevron, name } = buildRow(entry, depth);
  const isExpanded = expandedDirs.has(entry.path);
  chevron.textContent = isExpanded ? CHEVRON_EXPANDED : CHEVRON_COLLAPSED;
  chevron.classList.toggle('expanded', isExpanded);

  const childContainer = _el('div', { className: 'file-tree-children' });
  parentEl.append(row, childContainer);

  if (isExpanded) {
    await callbacks.renderDir(entry.path, childContainer, depth + 1, expandedDirs);
  }

  setupDropZone(row, entry.path);

  row.addEventListener('click', async () => {
    if (expandedDirs.has(entry.path)) {
      collapseDir(entry.path, childContainer, chevron, expandedDirs);
    } else {
      await expandDir(entry.path, childContainer, chevron, depth, expandedDirs);
    }
  });

  attachContextMenu(row, async () => {
    if (!expandedDirs.has(entry.path)) {
      await expandDir(entry.path, childContainer, chevron, depth, expandedDirs);
    }
    return buildDirContextItems(
      entry.path, findRootCwd(entry.path),
      childContainer, depth + 1, expandedDirs, name,
      (path, nameEl) => promptRename(path, nameEl),
      (dirPath, cEl, d, eDirs, type) => promptNewEntry(dirPath, cEl, d, eDirs, type),
    );
  });
}

/**
 * Render a single file entry into `parentEl`, wiring up click and
 * context-menu listeners.
 *
 * @param {Object} entry - { name, path }
 * @param {HTMLElement} parentEl
 * @param {number} depth
 * @param {{ activeRowRef: { current: HTMLElement|null }, findRootCwd: Function, promptRename: Function }} callbacks
 */
export function renderFileEntry(entry, parentEl, depth, callbacks) {
  const { activeRowRef, findRootCwd, promptRename } = callbacks;
  const { row, name } = buildRow(entry, depth);
  parentEl.appendChild(row);

  row.addEventListener('click', () => {
    if (activeRowRef.current) activeRowRef.current.classList.remove('active');
    row.classList.add('active');
    activeRowRef.current = row;
    bus.emit('file:open', { path: entry.path, name: entry.name });
  });

  attachContextMenu(row, () => buildFileContextItems(
    entry.path, name, findRootCwd(entry.path),
    (path, nameEl) => promptRename(path, nameEl),
  ));
}
