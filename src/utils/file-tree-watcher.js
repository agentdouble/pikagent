/**
 * Filesystem watch + debounce logic extracted from FileTree.
 * Manages watchers per section and coalesces rapid change events.
 */
import { DEBOUNCE_DELAY, WATCH_PREFIX } from './file-tree-helpers.js';

/**
 * Set up a debounced fs.onChanged listener.
 * @param {Map} debounceTimers - shared timer map
 * @param {(watchIdOrCwd: string) => Promise<void>} refreshSection - callback to refresh
 * @param {{ onChanged: (cb: (event: { id: string }) => void) => (() => void) }} fsApi - injected fs API
 * @returns {() => void} unsubscribe function
 */
export function listenForChanges(debounceTimers, refreshSection, fsApi) {
  return fsApi.onChanged(({ id }) => {
    if (debounceTimers.has(id)) {
      clearTimeout(debounceTimers.get(id));
    }
    debounceTimers.set(
      id,
      setTimeout(() => {
        debounceTimers.delete(id);
        refreshSection(id).catch(() => {});
      }, DEBOUNCE_DELAY),
    );
  });
}

/**
 * Start watching a directory for changes.
 * @param {string} cwd
 * @param {{ watch: (id: string, cwd: string) => void }} fsApi - injected fs API
 * @returns {string} watchId
 */
export function startWatch(cwd, fsApi) {
  const watchId = `${WATCH_PREFIX}${cwd}`;
  fsApi.watch(watchId, cwd);
  return watchId;
}

/**
 * Stop watching a directory.
 * @param {string} watchId
 * @param {{ unwatch: (id: string) => void }} fsApi - injected fs API
 */
export function stopWatch(watchId, fsApi) {
  fsApi.unwatch(watchId);
}
