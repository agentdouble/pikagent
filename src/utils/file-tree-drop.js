/**
 * Drag-and-drop (file drop) and inline-input helpers for FileTree.
 * Extracted from file-tree.js to reduce component size.
 */

import { emitFileOpen } from './workspace-events.js';
import { _el } from './dom.js';
import { setupInlineInput, startInlineRename } from './form-helpers.js';
import { setupDropZone as _setupDropZone } from './drop-zone-helpers.js';
import { INPUT_BLUR_DELAY, computeIndent, getBaseName } from './file-tree-helpers.js';

/**
 * Attach dragover / dragleave / drop listeners to an element so that files
 * dropped from the OS file manager are copied into a target directory.
 *
 * @param {HTMLElement} el - element to receive drop events
 * @param {string|(() => string)} getTargetDir - target dir path or a function returning it
 * @param {(files: FileList, destDir: string) => Promise<void>} handleFileDrop
 * @param {string} [className='drop-target'] - CSS class toggled during drag
 */
export function setupDropZone(el, getTargetDir, handleFileDrop, className = 'drop-target') {
  _setupDropZone(el, {
    hoverClass: className,
    accept: (e) => {
      if (!e.dataTransfer.types.includes('Files')) return false;
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      return true;
    },
    onDragLeave: (e) => {
      e.stopPropagation();
      el.classList.remove(className);
    },
    onDrop: async (e) => {
      e.stopPropagation();
      const targetDir = typeof getTargetDir === 'function' ? getTargetDir() : getTargetDir;
      if (!targetDir) return;
      await handleFileDrop(e.dataTransfer.files, targetDir);
    },
  });
}

/**
 * Copy an array of OS-provided files into `destDir` via the filesystem API.
 *
 * @param {FileList|File[]} files
 * @param {string} destDir
 * @param {{ copyTo: (src: string, dest: string) => Promise<unknown> }} api - injected API methods
 */
export async function handleFileDrop(files, destDir, { copyTo }) {
  for (const file of files) {
    if (file.path) {
      await copyTo(file.path, destDir);
    }
  }
}

/**
 * Show an inline rename input in place of `nameEl` and rename the entry
 * on commit.
 *
 * @param {string} entryPath
 * @param {HTMLElement} nameEl
 * @param {{ rename: (entryPath: string, newName: string) => Promise<unknown> }} api - injected API methods
 */
export function promptRename(entryPath, nameEl, { rename }) {
  const oldName = getBaseName(entryPath);
  const dotIndex = oldName.lastIndexOf('.');

  startInlineRename(nameEl, {
    className: 'file-tree-rename-input',
    value: oldName,
    selectRange: [0, dotIndex > 0 ? dotIndex : oldName.length],
    blurDelay: INPUT_BLUR_DELAY,
    replaceFn: (el, input) => { el.style.display = 'none'; el.parentElement.appendChild(input); },
    restoreFn: (el, input) => { input.remove(); el.style.display = ''; },
    onCommit: async (newName) => {
      if (!newName || newName === oldName) return;
      await rename(entryPath, newName);
    },
  });
}

/**
 * Show an inline input at the top of `parentContentEl` for creating a new
 * file or folder inside `dirPath`.
 *
 * @param {string} dirPath
 * @param {HTMLElement} parentContentEl
 * @param {number} depth
 * @param {Set<string>} expandedDirs
 * @param {'file'|'folder'} type
 * @param {{ mkdir: (path: string) => Promise<unknown>, writefile: (path: string, content: string) => Promise<unknown> }} api - injected API methods
 */
export function promptNewEntry(dirPath, parentContentEl, depth, expandedDirs, type, { mkdir, writefile }) {
  const input = _el('input', {
    className: 'file-tree-new-input',
    type: 'text',
    placeholder: type === 'folder' ? 'folder name' : 'filename',
    style: { marginLeft: `${computeIndent(depth + 1)}px` },
  });

  parentContentEl.prepend(input);
  input.focus();

  setupInlineInput(input, {
    blurDelay: INPUT_BLUR_DELAY,
    onCommit: async (name) => {
      input.remove();
      if (!name) return;
      const newPath = dirPath + '/' + name;
      if (type === 'folder') {
        await mkdir(newPath);
      } else {
        await writefile(newPath, '');
        /** @fires file:open {{ path: string, name: string }} — newly created file */
        emitFileOpen({ path: newPath, name });
      }
    },
  });
}
