/**
 * Drag-and-drop (file drop) and inline-input helpers for FileTree.
 * Extracted from file-tree.js to reduce component size.
 */

import { bus } from './events.js';
import { _el, setupInlineInput } from './dom.js';
import { INPUT_BLUR_DELAY, computeIndent } from './file-tree-helpers.js';

/**
 * Attach dragover / dragleave / drop listeners to an element so that files
 * dropped from the OS file manager are copied into a target directory.
 *
 * @param {HTMLElement} el - element to receive drop events
 * @param {string|Function} getTargetDir - target dir path or a function returning it
 * @param {Function} handleFileDrop - async (files, destDir) => void
 * @param {string} [className='drop-target'] - CSS class toggled during drag
 */
export function setupDropZone(el, getTargetDir, handleFileDrop, className = 'drop-target') {
  el.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    el.classList.add(className);
  });

  el.addEventListener('dragleave', (e) => {
    e.stopPropagation();
    el.classList.remove(className);
  });

  el.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove(className);
    const targetDir = typeof getTargetDir === 'function' ? getTargetDir() : getTargetDir;
    if (!targetDir) return;
    await handleFileDrop(e.dataTransfer.files, targetDir);
  });
}

/**
 * Copy an array of OS-provided files into `destDir` via the filesystem API.
 *
 * @param {FileList|File[]} files
 * @param {string} destDir
 * @param {{ copyTo: Function }} api - injected API methods
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
 * @param {{ rename: Function }} api - injected API methods
 */
export function promptRename(entryPath, nameEl, { rename }) {
  const oldName = entryPath.split('/').pop();
  const input = _el('input', { className: 'file-tree-rename-input', type: 'text', value: oldName });

  nameEl.style.display = 'none';
  nameEl.parentElement.appendChild(input);
  input.focus();
  const dotIndex = oldName.lastIndexOf('.');
  input.setSelectionRange(0, dotIndex > 0 ? dotIndex : oldName.length);

  setupInlineInput(input, {
    blurDelay: INPUT_BLUR_DELAY,
    onCommit: async (newName) => {
      input.remove();
      nameEl.style.display = '';
      if (!newName || newName === oldName) return;
      await rename(entryPath, newName);
    },
    onCancel: () => {
      input.remove();
      nameEl.style.display = '';
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
 * @param {{ mkdir: Function, writefile: Function }} api - injected API methods
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
        /** @emits file:open {{ path: string, name: string }} — newly created file */
        bus.emit('file:open', { path: newPath, name });
      }
    },
  });
}
