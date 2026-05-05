/**
 * File-tree section DOM building — extracted from FileTree to keep the
 * component focused on state management and rendering orchestration.
 *
 * Handles building section headers (chevron, label, action buttons)
 * and the associated context menu attachment.
 *
 * @typedef {{ setupDropZone: (el: HTMLElement, targetDir: string|(() => string|null)) => void, promptNewEntry: (dirPath: string, cEl: HTMLElement, depth: number, eDirs: Set<string>, type: string) => void, promptRename: (path: string, nameEl: HTMLElement) => void, refreshSection: (cwd: string) => void, contextMenuApi: unknown }} SectionDOMCallbacks
 */

import { _el } from './file-dom.js';
import { buildChevronRow } from './chevron-row.js';
import { attachContextMenu } from './context-menu.js';
import { emitWorkspaceCreateWorktree, emitWorkspaceOpenPr } from './workspace-events.js';
import {
  CHEVRON_EXPANDED, CHEVRON_COLLAPSED,
  extractFolderName, buildSectionActions, buildDirContextItems,
} from './file-tree-subsystem.js';

/**
 * Rebuild the DOM for a file-tree section: header + content container.
 * Preserves collapsed state across refreshes.
 *
 * @param {{ sectionEl: HTMLElement, expandedDirs: Set<string> }} section
 * @param {string} cwd
 * @param {SectionDOMCallbacks} callbacks
 * @returns {HTMLElement} the content element to render directory entries into
 */
export function rebuildSectionDOM(section, cwd, callbacks) {
  const wasCollapsed =
    section.sectionEl.querySelector('.file-tree-section-content.collapsed') !== null;
  section.sectionEl.replaceChildren();

  const contentEl = _el('div', { className: `file-tree-section-content${wasCollapsed ? ' collapsed' : ''}` });
  const { header } = _buildSectionHeader(cwd, contentEl, wasCollapsed, section.expandedDirs, callbacks);
  section.sectionEl.append(header, contentEl);

  callbacks.setupDropZone(header, cwd);
  callbacks.setupDropZone(contentEl, cwd);
  return contentEl;
}

/**
 * Build a section header with chevron toggle, label, and action buttons.
 * @param {string} cwd
 * @param {HTMLElement} contentEl
 * @param {boolean} wasCollapsed
 * @param {Set<string>} expandedDirs
 * @param {SectionDOMCallbacks} callbacks
 */
function _buildSectionHeader(cwd, contentEl, wasCollapsed, expandedDirs, callbacks) {
  const actionsContainer = buildSectionActions({
    newFile:     () => callbacks.promptNewEntry(cwd, contentEl, 0, expandedDirs, 'file'),
    newFolder:   () => callbacks.promptNewEntry(cwd, contentEl, 0, expandedDirs, 'folder'),
    newWorktree: () => emitWorkspaceCreateWorktree({ repoCwd: cwd }),
    openPr:      () => emitWorkspaceOpenPr({ repoCwd: cwd }),
    refresh:     () => callbacks.refreshSection(cwd),
  });

  const { chevron, name: labelEl, row: header } = buildChevronRow({
    chevronClass: 'file-tree-section-chevron',
    chevronText: wasCollapsed ? CHEVRON_COLLAPSED : CHEVRON_EXPANDED,
    nameClass: 'file-tree-section-label',
    name: extractFolderName(cwd),
    containerClass: 'file-tree-section-header',
    extraChildren: [actionsContainer],
  });
  labelEl.title = cwd;

  header.addEventListener('click', () => {
    const collapsed = contentEl.classList.toggle('collapsed');
    chevron.textContent = collapsed ? CHEVRON_COLLAPSED : CHEVRON_EXPANDED;
  });

  attachContextMenu(header, () => buildDirContextItems(
    cwd, cwd, contentEl, 0, expandedDirs, null,
    callbacks.promptRename,
    callbacks.promptNewEntry,
    callbacks.contextMenuApi,
  ));

  return { chevron, header };
}
