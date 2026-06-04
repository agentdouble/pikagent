/**
 * Directory-entry rendering helpers for FileTree.
 * Extracted from file-tree.js to reduce component size.
 */

import { emitFileOpen } from './workspace-events.js';
import { _el } from './dom-api.js';
import { createActionButton } from './dom-buttons.js';
import { buildChevronRow } from './dom-lists.js';
import { computeIndent, CHEVRON_EXPANDED, CHEVRON_COLLAPSED, SVG_ICONS, HEADER_ACTIONS } from './file-tree-helpers.js';
import { buildFileContextItems, buildDirContextItems } from './file-tree-context-menu.js';
import { attachContextMenu } from './context-menu.js';
import { isAgentsMarkdownFile, shouldEditAgentsOnDoubleClick } from './agents-editor-settings.js';
import { getFileIcon } from './file-icons.js';

const FOLDER_ICON_CLOSED = '📁';
const FOLDER_ICON_OPEN = '📂';

// ── SVG icon parsing ──

function _parseSvg(svgStr) {
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  return doc.documentElement;
}

/** Parse all SVG icons once at module load from the declarative SVG_ICONS map. */
const PARSED_ICONS = Object.fromEntries(
  Object.entries(SVG_ICONS).map(([k, v]) => [k, _parseSvg(v)])
);

/**
 * Build a generic row element with a chevron and name span.
 *
 * @param {{ name: string }} entry
 * @param {number} depth
 * @returns {{ row: HTMLElement, chevron: HTMLElement, name: HTMLElement }}
 */
function createTreeIcon(icon, title) {
  return _el('span', {
    className: 'file-tree-icon',
    textContent: icon,
    title,
    ariaHidden: true,
  });
}

function setFolderIconState(iconEl, isExpanded) {
  iconEl.textContent = isExpanded ? FOLDER_ICON_OPEN : FOLDER_ICON_CLOSED;
  iconEl.title = isExpanded ? 'Open folder' : 'Folder';
}

function buildRow(entry, depth, iconEl = null) {
  return buildChevronRow({
    chevronClass: 'file-tree-chevron',
    nameClass: 'file-tree-name',
    name: entry.name,
    containerClass: 'file-tree-item',
    depth,
    computeIndent,
    afterChevronChildren: iconEl ? [iconEl] : [],
  });
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
  const isExpanded = expandedDirs.has(entry.path);
  const folderIcon = createTreeIcon('', 'Folder');
  setFolderIconState(folderIcon, isExpanded);
  const { row, chevron, name } = buildRow(entry, depth, folderIcon);
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
    setFolderIconState(folderIcon, expandedDirs.has(entry.path));
  });

  attachContextMenu(row, async () => {
    if (!expandedDirs.has(entry.path)) {
      await expandDir(entry.path, childContainer, chevron, depth, expandedDirs);
      setFolderIconState(folderIcon, true);
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
  const { row, name } = buildRow(entry, depth, createTreeIcon(getFileIcon(entry.name), 'File'));
  parentEl.appendChild(row);

  row.addEventListener('click', () => {
    if (activeRowRef.current) activeRowRef.current.classList.remove('active');
    row.classList.add('active');
    activeRowRef.current = row;
    /** @fires file:open {{ path: string, name: string }} */
    emitFileOpen({ path: entry.path, name: entry.name });
  });

  row.addEventListener('dblclick', (event) => {
    event.preventDefault();
    if (!shouldEditAgentsOnDoubleClick() || !isAgentsMarkdownFile(entry)) return;
    emitFileOpen({ path: entry.path, name: entry.name, viewMode: 'edit' });
  });

  attachContextMenu(row, () => buildFileContextItems(
    entry.path, name, findRootCwd(entry.path),
    (path, nameEl) => promptRename(path, nameEl),
    contextMenuApi,
  ));
}

/**
 * Build the action buttons container for a section header.
 *
 * @param {Record<string, () => void>} actionDispatcher - action name -> handler
 * @returns {HTMLElement} container with action buttons
 */
export function buildSectionActions(actionDispatcher) {
  const actionBtns = HEADER_ACTIONS.map(({ key, title, action }) =>
    createActionButton({
      title,
      cls: 'file-tree-action-btn',
      childNode: PARSED_ICONS[key].cloneNode(true),
      stopPropagation: true,
      onClick: actionDispatcher[action],
    }),
  );
  return _el('div', { className: 'file-tree-section-actions' }, ...actionBtns);
}
