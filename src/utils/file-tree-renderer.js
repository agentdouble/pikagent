/**
 * Directory-entry rendering helpers for FileTree.
 * Extracted from file-tree.js to reduce component size.
 */

import { bus, EVENTS } from './events.js';
import { _el, buildChevronRow } from './dom-dialogs.js';
import { computeIndent, CHEVRON_EXPANDED, CHEVRON_COLLAPSED, SVG_ICONS } from './file-tree-helpers.js';
import { buildFileContextItems, buildDirContextItems } from './file-tree-context-menu.js';
import { attachContextMenu } from './context-menu.js';

// ── SVG icon parsing ──

function _parseSvg(svgStr) {
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  return doc.documentElement;
}

/** Parse all SVG icons once at module load from the declarative SVG_ICONS map. */
export const PARSED_ICONS = Object.fromEntries(
  Object.entries(SVG_ICONS).map(([k, v]) => [k, _parseSvg(v)])
);

/**
 * Build a generic row element with a chevron and name span.
 *
 * @param {{ name: string }} entry
 * @param {number} depth
 * @returns {{ row: HTMLElement, chevron: HTMLElement, name: HTMLElement }}
 */
export function buildRow(entry, depth) {
  const { chevron, name } = buildChevronRow({
    chevronClass: 'file-tree-chevron',
    nameClass: 'file-tree-name',
    name: entry.name,
  });
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
 * @param {{ name: string, path: string, isDirectory: boolean }} entry
 * @param {HTMLElement} parentEl
 * @param {number} depth
 * @param {Set<string>} expandedDirs
 * @param {{ setupDropZone: (el: HTMLElement, targetDir: string) => void, expandDir: (dirPath: string, childContainer: HTMLElement, chevron: HTMLElement, depth: number, expandedDirs: Set<string>) => Promise<void>, collapseDir: (dirPath: string, childContainer: HTMLElement, chevron: HTMLElement, expandedDirs: Set<string>) => void, renderDir: (dirPath: string, parentEl: HTMLElement, depth: number, expandedDirs: Set<string>) => Promise<void>, findRootCwd: (entryPath: string) => string, promptRename: (path: string, nameEl: HTMLElement) => void, promptNewEntry: (dirPath: string, contentEl: HTMLElement, depth: number, expandedDirs: Set<string>, type: string) => void, contextMenuApi: unknown }} callbacks
 */
export async function renderDirEntry(entry, parentEl, depth, expandedDirs, callbacks) {
  const { setupDropZone, expandDir, collapseDir, findRootCwd, promptRename, promptNewEntry, contextMenuApi } = callbacks;
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
      contextMenuApi,
    );
  });
}

/**
 * Render a single file entry into `parentEl`, wiring up click and
 * context-menu listeners.
 *
 * @param {{ name: string, path: string }} entry
 * @param {HTMLElement} parentEl
 * @param {number} depth
 * @param {{ activeRowRef: { current: HTMLElement|null }, findRootCwd: (entryPath: string) => string, promptRename: (path: string, nameEl: HTMLElement) => void, contextMenuApi: unknown }} callbacks
 */
export function renderFileEntry(entry, parentEl, depth, callbacks) {
  const { activeRowRef, findRootCwd, promptRename, contextMenuApi } = callbacks;
  const { row, name } = buildRow(entry, depth);
  parentEl.appendChild(row);

  row.addEventListener('click', () => {
    if (activeRowRef.current) activeRowRef.current.classList.remove('active');
    row.classList.add('active');
    activeRowRef.current = row;
    /** @fires file:open {{ path: string, name: string }} */
    bus.emit(EVENTS.FILE_OPEN, { path: entry.path, name: entry.name });
  });

  attachContextMenu(row, () => buildFileContextItems(
    entry.path, name, findRootCwd(entry.path),
    (path, nameEl) => promptRename(path, nameEl),
    contextMenuApi,
  ));
}
