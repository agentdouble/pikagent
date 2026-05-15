/**
 * Domain facade for the FileTree component.
 *
 * Aggregates the fs, shell and clipboard API methods needed by file-tree.js
 * so the component imports a single module instead of multiple services.
 */
import fsApi from '../services/fs-api.js';
import shellApi from '../services/shell-api.js';
import clipboardApi from '../services/clipboard-api.js';
import { composeFacade } from './compose-facade.js';

export const fileTreeViewFacade = composeFacade([
  [fsApi, ['copy', 'copyTo', 'rename', 'mkdir', 'writefile', 'readdir', 'watch', 'unwatch', 'onChanged', 'trash']],
  [shellApi, ['showInFolder']],
  [clipboardApi, { clipboardWrite: 'write' }],
]);
