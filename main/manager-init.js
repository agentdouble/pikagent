/**
 * Manager initialization and dependency wiring.
 *
 * Centralises the creation of every manager singleton and the inter-manager
 * dependencies that used to live inside ipc-handlers.js.  The main entry
 * point calls `initManagers()` once and passes the result to the IPC layer.
 *
 * Managers are lazy-loaded via getter properties so that each domain module
 * is only `require()`-d when first accessed (i.e. inside `initManagers()`),
 * rather than at module-load time.  This reduces coupling and speeds up
 * initial require of this file.
 *
 * All managers are sourced from the consolidated barrel:
 *   managers.js — ptyManager, fsManager, sessionManager, usageManager,
 *                 flowManager, skillsManager, gitManager, configManager,
 *                 updateManager
 */

/**
 * Define a lazy, self-caching property on `obj`.
 *
 * On first access the `factory` callback is invoked and its return value
 * replaces the getter with a plain data property, so subsequent reads are
 * zero-cost.
 *
 * @param {object} obj      Target object.
 * @param {string} name     Property name.
 * @param {() => any} factory  Called once to produce the value.
 */
function lazyProp(obj, name, factory) {
  Object.defineProperty(obj, name, {
    configurable: true,
    enumerable: true,
    get() {
      const value = factory();
      Object.defineProperty(obj, name, { value, enumerable: true });
      return value;
    },
  });
}

/**
 * Resolve a manager from the consolidated barrel module.
 *
 * @param {string} name  Manager export name, e.g. 'ptyManager'.
 * @returns {any}
 */
function resolveManager(name) {
  return require('./managers')[name];
}

/**
 * Lazy accessor object — each property loads its manager on first access,
 * then caches the result by replacing itself with a plain data property.
 */
const managers = {};

const ALL_MANAGER_NAMES = [
  'ptyManager',
  'fsManager',
  'sessionManager',
  'usageManager',
  'flowManager',
  'skillsManager',
  'gitManager',
  'configManager',
  'updateManager',
];

for (const name of ALL_MANAGER_NAMES) {
  lazyProp(managers, name, () => resolveManager(name));
}

const { safeSend } = require('./ipc-helpers');

/**
 * Names of managers that expose a `cleanup()` method and should be torn
 * down when the application closes.  Resolved lazily via `managers[name]`
 * so the modules are not loaded until cleanup time (which is after
 * `initManagers()` has already accessed them).
 *
 * Guarded at definition time: every entry must correspond to a known manager.
 */
const LIFECYCLE_NAMES = [
  'sessionManager',
  'ptyManager',
  'fsManager',
  'flowManager',
  'usageManager',
];

// Guard: verify every lifecycle name maps to a known manager property.
for (const name of LIFECYCLE_NAMES) {
  if (!ALL_MANAGER_NAMES.includes(name)) {
    throw new Error(`LIFECYCLE_NAMES contains unknown manager: "${name}"`);
  }
}

/**
 * Wire inter-manager dependencies and start runtime services.
 *
 * @param {() => import('electron').BrowserWindow} getWindow
 * @returns {{ targets: Record<string, object>, cleanup: () => void }}
 */
function initManagers(getWindow) {
  // -- Lifecycle: start managers that need runtime context --
  // Access order matters: updateManager first, then flow, session, usage.
  managers.updateManager.init();
  managers.flowManager.start(getWindow, managers.ptyManager);
  managers.sessionManager.start(managers.ptyManager);
  managers.usageManager.init(managers.sessionManager);

  // -- Build target map consumed by IPC dispatching --
  const { shell, clipboard } = require('electron');

  // Adapter: update-manager exposes functional names (checkForUpdates,
  // getVersion, performUpdate); the IPC schema uses shorter aliases
  // (check, version, run) and `run` needs a per-call progress callback.
  const updateTarget = {
    check:    () => managers.updateManager.checkForUpdates(),
    version:  () => managers.updateManager.getVersion(),
    relaunch: () => managers.updateManager.relaunch(),
    run:      () => managers.updateManager.performUpdate((p) => safeSend(getWindow, 'update:progress', p)),
  };

  // Adapter: api-schema's `shell:showInFolder` channel maps to Electron's
  // `shell.showItemInFolder`, and `clipboard:write` (string arg) maps to
  // `clipboard.writeText` — Electron's `clipboard.write` only accepts an
  // object payload.
  const shellTarget = {
    showInFolder: (p) => shell.showItemInFolder(p),
    openExternal: (url) => shell.openExternal(url),
    openPath:     (p) => shell.openPath(p),
  };
  const clipboardTarget = {
    write: (text) => clipboard.writeText(text),
  };

  const targets = {
    pty:       managers.ptyManager,
    fs:        managers.fsManager,
    git:       managers.gitManager,
    config:    managers.configManager,
    flow:      managers.flowManager,
    usage:     managers.usageManager,
    skills:    managers.skillsManager,
    update:    updateTarget,
    shell:     shellTarget,
    clipboard: clipboardTarget,
  };

  function cleanup() {
    for (const name of LIFECYCLE_NAMES) {
      const mod = managers[name];
      if (typeof mod.cleanup === 'function') mod.cleanup();
    }
  }

  return { targets, cleanup, ptyManager: managers.ptyManager, sessionManager: managers.sessionManager };
}

module.exports = { initManagers };
