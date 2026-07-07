/**
 * File-tree section DOM building — extracted from FileTree to keep the
 * component focused on state management and rendering orchestration.
 *
 * Handles building section headers (chevron, label, action buttons)
 * and the associated context menu attachment.
 *
 * @typedef {{ setupDropZone: (el: HTMLElement, targetDir: string|(() => string|null)) => void, promptNewEntry: (dirPath: string, cEl: HTMLElement, depth: number, eDirs: Set<string>, type: string) => void, promptRename: (path: string, nameEl: HTMLElement) => void, refreshSection: (cwd: string) => void, contextMenuApi: unknown }} SectionDOMCallbacks
 */

import { _el } from './dom-api.js';
import { buildChevronRow, toggleCollapsible } from './dom-lists.js';
import { attachContextMenu } from './context-menu.js';
import { emitWorkspaceCreateWorktree, emitWorkspaceOpenPr } from './workspace-events.js';
import {
  CHEVRON_EXPANDED, CHEVRON_COLLAPSED,
  extractFolderName,
} from './file-tree-helpers.js';
import { formatTreePath, isSshPath } from './remote-path.js';
import { buildSectionActions } from './file-tree-renderer.js';
import { buildDirContextItems } from './file-tree-context-menu.js';

/**
 * Internal Set used to track section collapsed state via toggleCollapsible.
 * A section whose cwd is present in this Set is considered *expanded* (not collapsed).
 * The Set is rebuilt from the DOM on each rebuildSectionDOM call.
 */
const _sectionExpandedState = new Set();
/** _sectionExpandedState tracks expanded sections — key present = expanded. */
const SECTION_CHEVRON_TEXTS = { presentText: CHEVRON_EXPANDED, absentText: CHEVRON_COLLAPSED };

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

  // Sync the module-level expanded state Set with the DOM-derived collapsed flag
  if (wasCollapsed) _sectionExpandedState.delete(cwd);
  else _sectionExpandedState.add(cwd);

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
  const isRemote = isSshPath(cwd);
  const actionsContainer = buildSectionActions({
    newFile:     () => callbacks.promptNewEntry(cwd, contentEl, 0, expandedDirs, 'file'),
    newFolder:   () => callbacks.promptNewEntry(cwd, contentEl, 0, expandedDirs, 'folder'),
    newWorktree: () => emitWorkspaceCreateWorktree({ repoCwd: cwd }),
    openPr:      () => emitWorkspaceOpenPr({ repoCwd: cwd }),
    refresh:     () => callbacks.refreshSection(cwd),
  }, isRemote ? ['newFile', 'newFolder', 'refresh'] : null);

  const { chevron, name: labelEl, row: header } = buildChevronRow({
    chevronClass: 'file-tree-section-chevron',
    chevronText: wasCollapsed ? CHEVRON_COLLAPSED : CHEVRON_EXPANDED,
    nameClass: 'file-tree-section-label',
    name: extractFolderName(cwd),
    containerClass: 'file-tree-section-header',
    extraChildren: [actionsContainer],
  });
  labelEl.title = formatTreePath(cwd);

  header.addEventListener('click', () => {
    toggleCollapsible(_sectionExpandedState, cwd, chevron, SECTION_CHEVRON_TEXTS, { el: contentEl, absentCls: 'collapsed' });
  });

  attachContextMenu(header, () => buildDirContextItems(
    cwd, cwd, contentEl, 0, expandedDirs, null,
    callbacks.promptRename,
    callbacks.promptNewEntry,
    callbacks.contextMenuApi,
  ));

  return { chevron, header };
}
