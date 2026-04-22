/**
 * Bus-event listener setup for FileViewer.
 * Extracted from file-viewer.js to reduce component size.
 */

import { onTerminalCwdChanged } from './lifecycle-events.js';
import { onFileOpen, onWorkspaceActivated } from './workspace-events.js';

/**
 * Subscribe to bus events that drive file-viewer behaviour.
 * Returns an array of unsubscribe functions for cleanup.
 *
 * @param {{ isActive: () => boolean }} guards
 * @param {{
 *   switchMode: (mode: string) => void,
 *   openFile: (path: string, name: string) => void,
 *   gitChanges: { setCwd: (cwd: string) => void, loadChanges: () => void },
 *   getMode: () => string,
 *   loadPinnedFiles: () => void,
 * }} handlers
 * @returns {Array<() => void>} unsubscribe functions
 */
export function setupFileViewerListeners({ isActive }, handlers) {
  return [
    onFileOpen(({ path, name }) => {
      if (!isActive()) return;
      handlers.switchMode('files');
      handlers.openFile(path, name);
    }),
    onTerminalCwdChanged(({ cwd }) => {
      if (!isActive()) return;
      handlers.gitChanges.setCwd(cwd);
      if (handlers.getMode() === 'git') handlers.gitChanges.loadChanges();
    }),
    onWorkspaceActivated(() => {
      if (!isActive()) return;
      handlers.loadPinnedFiles();
    }),
  ];
}
