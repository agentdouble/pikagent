/**
 * Section header and section rendering helpers for FileTree.
 * Extracted from file-tree.js to reduce component size.
 */

import { _el, createActionButton } from './dom.js';
import {
  CHEVRON_EXPANDED, CHEVRON_COLLAPSED,
  HEADER_ACTIONS,
  extractFolderName,
} from './file-tree-helpers.js';
import { buildDirContextItems } from './file-tree-context-menu.js';
import { attachContextMenu } from './context-menu.js';
import { bus, EVENTS } from './events.js';
import { PARSED_ICONS } from './file-tree-renderer.js';

/**
 * Build the section header element for a directory section.
 *
 * @param {string} cwd - section root directory path
 * @param {HTMLElement} contentEl - the content element toggled by collapse
 * @param {HTMLElement} chevron - the chevron element for collapse state
 * @param {Set<string>} expandedDirs - mutable set of expanded directories
 * @param {{ promptNewEntry: (dirPath: string, contentEl: HTMLElement, depth: number, expandedDirs: Set<string>, type: string) => void, promptRename: (path: string, nameEl: HTMLElement) => void, contextMenuApi: unknown }} callbacks
 * @returns {HTMLElement}
 */
export function buildSectionHeader(cwd, contentEl, chevron, expandedDirs, callbacks) {
  const actionDispatcher = {
    newFile:     () => callbacks.promptNewEntry(cwd, contentEl, 0, expandedDirs, 'file'),
    newFolder:   () => callbacks.promptNewEntry(cwd, contentEl, 0, expandedDirs, 'folder'),
    newWorktree: () => bus.emit(EVENTS.WORKSPACE_CREATE_WORKTREE, { repoCwd: cwd }),
    openPr:      () => bus.emit(EVENTS.WORKSPACE_OPEN_PR, { repoCwd: cwd }),
    refresh:     () => callbacks.onRefresh(cwd),
  };
  const actionBtns = HEADER_ACTIONS.map(({ key, title, action }) =>
    createActionButton({
      title,
      cls: 'file-tree-action-btn',
      childNode: PARSED_ICONS[key].cloneNode(true),
      stopPropagation: true,
      onClick: actionDispatcher[action],
    }),
  );

  const header = _el('div', {
    className: 'file-tree-section-header',
    onClick: () => {
      const collapsed = contentEl.classList.toggle('collapsed');
      chevron.textContent = collapsed ? CHEVRON_COLLAPSED : CHEVRON_EXPANDED;
    },
  },
    chevron,
    _el('span', { className: 'file-tree-section-label', textContent: extractFolderName(cwd), title: cwd }),
    _el('div', { className: 'file-tree-section-actions' }, ...actionBtns),
  );

  attachContextMenu(header, () => buildDirContextItems(
    cwd, cwd, contentEl, 0, expandedDirs, null,
    (path, nameEl) => callbacks.promptRename(path, nameEl),
    (dirPath, cEl, depth, eDirs, type) => callbacks.promptNewEntry(dirPath, cEl, depth, eDirs, type),
    callbacks.contextMenuApi,
  ));

  return header;
}

/**
 * Rebuild a section element, preserving collapse state.
 *
 * @param {{ sectionEl: HTMLElement, expandedDirs: Set<string>, _refreshing?: boolean, _pendingRefresh?: boolean }} section
 * @param {string} cwd
 * @param {{ buildSectionHeader: (cwd: string, contentEl: HTMLElement, chevron: HTMLElement, expandedDirs: Set<string>) => HTMLElement, setupDropZone: (el: HTMLElement, targetDir: string|(() => string|null)) => void, renderDir: (dirPath: string, parentEl: HTMLElement, depth: number, expandedDirs: Set<string>) => Promise<void>, refreshSection: (cwd: string) => Promise<void> }} callbacks
 */
export async function refreshSectionDOM(section, cwd, callbacks) {
  if (section._refreshing) {
    section._pendingRefresh = true;
    return;
  }
  section._refreshing = true;

  const wasCollapsed =
    section.sectionEl.querySelector('.file-tree-section-content.collapsed') !== null;

  section.sectionEl.replaceChildren();

  const contentEl = _el('div', { className: `file-tree-section-content${wasCollapsed ? ' collapsed' : ''}` });
  const chevron = _el('span', {
    className: 'file-tree-section-chevron',
    textContent: wasCollapsed ? CHEVRON_COLLAPSED : CHEVRON_EXPANDED,
  });

  const header = callbacks.buildSectionHeader(cwd, contentEl, chevron, section.expandedDirs);
  section.sectionEl.append(header, contentEl);

  callbacks.setupDropZone(header, cwd);
  callbacks.setupDropZone(contentEl, cwd);

  try {
    await callbacks.renderDir(cwd, contentEl, 0, section.expandedDirs);
  } finally {
    section._refreshing = false;
    if (section._pendingRefresh) {
      section._pendingRefresh = false;
      callbacks.refreshSection(cwd).catch(() => {});
    }
  }
}
