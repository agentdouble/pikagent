/**
 * FileTree directory operations — extracted from FileTree component.
 *
 * Handles expand/collapse, directory entry rendering callbacks, section
 * management (setTerminalRoot, removeTerminal, refreshSection).
 */

import { _el } from './file-dom.js';
import {
  CHEVRON_EXPANDED, CHEVRON_COLLAPSED,
  resolveWatchCwd,
  renderDirEntry, renderFileEntry,
  startWatch, stopWatch,
} from './file-tree-subsystem.js';
import { rebuildSectionDOM } from './file-tree-section-dom.js';

/**
 * Expand a directory in the tree.
 */
export async function expandDir(dirPath, childContainer, chevron, depth, expandedDirs, renderDirFn) {
  expandedDirs.add(dirPath);
  chevron.textContent = CHEVRON_EXPANDED;
  chevron.classList.add('expanded');
  await renderDirFn(dirPath, childContainer, depth + 1, expandedDirs);
}

/**
 * Collapse a directory in the tree.
 */
export function collapseDir(dirPath, childContainer, chevron, expandedDirs) {
  expandedDirs.delete(dirPath);
  childContainer.replaceChildren();
  chevron.textContent = CHEVRON_COLLAPSED;
  chevron.classList.remove('expanded');
}

/**
 * Build the callbacks object for renderDirEntry.
 * @param {object} ft - FileTree instance
 * @param {Set<string>} expandedDirs
 */
export function getDirEntryCallbacks(ft, expandedDirs) {
  return {
    setupDropZone: (el, targetDir) => ft._setupDropZone(el, targetDir),
    expandDir: (dirPath, childContainer, chevron, depth, eDirs) =>
      expandDir(dirPath, childContainer, chevron, depth, eDirs, (dp, pe, d, ed) => ft.renderDir(dp, pe, d, ed)),
    collapseDir: (dirPath, childContainer, chevron, eDirs) =>
      collapseDir(dirPath, childContainer, chevron, eDirs),
    renderDir: (dirPath, parentEl, depth, eDirs) =>
      ft.renderDir(dirPath, parentEl, depth, eDirs),
    findRootCwd: (entryPath) => ft.findRootCwd(entryPath),
    promptRename: (path, nameEl) => ft.promptRename(path, nameEl),
    promptNewEntry: (dirPath, cEl, depth, eDirs, type) =>
      ft.promptNewEntry(dirPath, cEl, depth, eDirs, type),
    contextMenuApi: ft._contextMenuApi,
  };
}

/**
 * Render a single directory entry.
 */
export async function renderDirEntryWrap(ft, entry, parentEl, depth, expandedDirs) {
  await renderDirEntry(entry, parentEl, depth, expandedDirs, getDirEntryCallbacks(ft, expandedDirs));
}

/**
 * Render a single file entry.
 */
export function renderFileEntryWrap(ft, entry, parentEl, depth) {
  const activeRowRef = {
    get current() { return ft._activeRow; },
    set current(v) { ft._activeRow = v; },
  };
  renderFileEntry(entry, parentEl, depth, {
    activeRowRef,
    findRootCwd: (entryPath) => ft.findRootCwd(entryPath),
    promptRename: (path, nameEl) => ft.promptRename(path, nameEl),
    contextMenuApi: ft._contextMenuApi,
  });
}

/**
 * Render all entries in a directory.
 */
export async function renderDir(ft, dirPath, parentEl, depth, expandedDirs, fsReaddir) {
  const entries = await fsReaddir(dirPath);
  for (const entry of entries) {
    if (entry.isDirectory) {
      await renderDirEntryWrap(ft, entry, parentEl, depth, expandedDirs);
    } else {
      renderFileEntryWrap(ft, entry, parentEl, depth);
    }
  }
}

/**
 * Set a terminal root and create/reuse a section.
 */
export async function setTerminalRoot(ft, termId, dirPath, fsWatch, refreshSectionFn, fsUnwatch) {
  const prevCwd = ft.termCwds.get(termId);
  if (prevCwd === dirPath) return;

  if (prevCwd) removeTermFromSection(ft, termId, prevCwd, fsUnwatch);

  ft.termCwds.set(termId, dirPath);

  const existing = ft.sections.get(dirPath);
  if (existing) { existing.termIds.add(termId); return; }

  const sectionEl = _el('div', { className: 'file-tree-section' });
  const expandedDirs = new Set([dirPath]);
  const watchId = startWatch(dirPath, { watch: fsWatch });
  ft.sections.set(dirPath, { termIds: new Set([termId]), sectionEl, expandedDirs, watchId });
  ft.treeEl.appendChild(sectionEl);
  await refreshSectionFn(dirPath);
}

/**
 * Remove a terminal from the tree.
 */
export function removeTerminal(ft, termId, fsUnwatch) {
  const cwd = ft.termCwds.get(termId);
  if (!cwd) return;
  ft.termCwds.delete(termId);
  removeTermFromSection(ft, termId, cwd, fsUnwatch);
}

/**
 * Remove a terminal from its section, and cleanup if section is empty.
 */
export function removeTermFromSection(ft, termId, cwd, fsUnwatch) {
  const section = ft.sections.get(cwd);
  if (!section) return;

  section.termIds.delete(termId);

  if (section.termIds.size === 0) {
    stopWatch(section.watchId, { unwatch: fsUnwatch || (() => {}) });
    section.sectionEl.remove();
    ft.sections.delete(cwd);
  }
}

/**
 * Refresh a section's DOM.
 */
export async function refreshSection(ft, watchIdOrCwd, renderDirFn) {
  const cwd = resolveWatchCwd(watchIdOrCwd);
  const section = ft.sections.get(cwd);
  if (!section) return;

  if (section._refreshing) { section._pendingRefresh = true; return; }
  section._refreshing = true;

  const contentEl = rebuildSectionDOM(section, cwd, {
    setupDropZone: (el, targetDir) => ft._setupDropZone(el, targetDir),
    promptNewEntry: (dirPath, cEl, depth, eDirs, type) => ft.promptNewEntry(dirPath, cEl, depth, eDirs, type),
    promptRename: (path, nameEl) => ft.promptRename(path, nameEl),
    refreshSection: (c) => ft.refreshSection(c),
    contextMenuApi: ft._contextMenuApi,
  });

  try {
    await renderDirFn(cwd, contentEl, 0, section.expandedDirs);
  } finally {
    section._refreshing = false;
    if (section._pendingRefresh) {
      section._pendingRefresh = false;
      ft.refreshSection(cwd).catch(() => {});
    }
  }
}
