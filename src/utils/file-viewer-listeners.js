/**
 * Bus-event listener setup for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */

import { subscribeBus, EVENTS } from './events.js';

/**
 * Subscribe to bus events that drive file-viewer behaviour.
 * Returns the listener handles needed for cleanup via `unsubscribeBus`.
 *
 * @param {{ isActive: () => boolean }} guards
 * @param {{
 *   switchMode: (mode: string) => void,
 *   openFile: (path: string, name: string) => void,
 *   gitChanges: { setCwd: (cwd: string) => void, loadChanges: () => void },
 *   getMode: () => string,
 *   loadPinnedFiles: () => void,
 * }} handlers
 * @returns {Array} listener handles for `unsubscribeBus`
 */
export function setupFileViewerListeners({ isActive }, handlers) {
  return subscribeBus([
    /** @listens file:open {{ path: string, name: string }} */
    [EVENTS.FILE_OPEN, ({ path, name }) => {
      if (!isActive()) return;
      handlers.switchMode('files');
      handlers.openFile(path, name);
    }],
    /** @listens terminal:cwdChanged {{ id: string, cwd: string }} */
    [EVENTS.TERMINAL_CWD_CHANGED, ({ cwd }) => {
      if (!isActive()) return;
      handlers.gitChanges.setCwd(cwd);
      if (handlers.getMode() === 'git') handlers.gitChanges.loadChanges();
    }],
    /** @listens workspace:activated {undefined} */
    [EVENTS.WORKSPACE_ACTIVATED, () => {
      if (!isActive()) return;
      handlers.loadPinnedFiles();
    }],
  ]);
}
