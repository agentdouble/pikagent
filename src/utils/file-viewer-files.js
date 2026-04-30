/**
 * File management helpers extracted from FileViewer.
 * Handles open-file state, pinning, modification tracking, and close logic.
 */
import { detectLanguage } from './file-icons.js';
import { pinnedFiles } from './editor-helpers.js';

/**
 * Open a file and add it to the open-files map.
 * If already open, returns false (caller should just activate the tab).
 *
 * @param {Map} openFiles
 * @param {string} filePath
 * @param {string} fileName
 * @param {{ readfile: Function }} fsApi - injected fs API
 * @returns {Promise<boolean>} true if the file was newly opened
 */
export async function openFileEntry(openFiles, filePath, fileName, fsApi) {
  if (openFiles.has(filePath)) return false;

  const result = await fsApi.readfile(filePath);
  if (result.error) {
    openFiles.set(filePath, { name: fileName, content: '', savedContent: '', lang: 'plaintext', error: result.error, viewMode: 'edit' });
  } else {
    const lang = detectLanguage(fileName);
    const viewMode = lang === 'markdown' ? 'preview' : 'edit';
    openFiles.set(filePath, { name: fileName, content: result.content, savedContent: result.content, lang, error: null, viewMode });
  }
  return true;
}

/** Check whether a file has unsaved changes. */
export function isModified(openFiles, filePath) {
  const file = openFiles.get(filePath);
  if (!file) return false;
  return file.content !== file.savedContent;
}

/** Check whether a file is pinned. */
export function isPinned(filePath) {
  return pinnedFiles.has(filePath);
}

/** Toggle the pinned state of a file. */
export function togglePin(openFiles, filePath) {
  const file = openFiles.get(filePath);
  if (!file) return;
  if (pinnedFiles.has(filePath)) {
    pinnedFiles.delete(filePath);
  } else {
    pinnedFiles.set(filePath, { name: file.name });
  }
}

/** Check if a file is markdown. */
export function isMarkdown(openFiles, filePath) {
  const file = openFiles.get(filePath);
  return !!file && file.lang === 'markdown';
}

/**
 * Close a file, handling unsaved-changes confirmation.
 * Returns the next file to activate (or null if none remain), or false if close was cancelled.
 */
export function closeFileEntry(openFiles, filePath, activeFile) {
  if (isModified(openFiles, filePath)) {
    const file = openFiles.get(filePath);
    if (!confirm(`"${file.name}" has unsaved changes. Close anyway?`)) return false;
  }

  openFiles.delete(filePath);

  if (activeFile === filePath) {
    if (openFiles.size > 0) {
      return { switchTo: [...openFiles.keys()].pop() };
    }
    return { switchTo: null };
  }
  return { switchTo: undefined }; // no switch needed, just re-render tabs
}
