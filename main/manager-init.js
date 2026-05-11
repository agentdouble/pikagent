/**
 * Manager initialization and dependency wiring.
 *
 * Centralises the creation of every manager singleton and the inter-manager
 * dependencies that used to live inside ipc-handlers.js.  The main entry
 * point calls `initManagers()` once and passes the result to the IPC layer.
 *
 * Managers are organized into 4 domain groups (sourced from `managers.js`):
 *   IO        — ptyManager, fsManager
 *   Data      — sessionManager, usageManager
 *   Workflow  — flowManager, skillsManager
 *   Infra     — gitManager, configManager, updateManager
 *
 * Each domain group is lazy-loaded via a getter property so that modules
 * are only `require()`-d when first accessed (inside `initManagers()`),
 * rather than at module-load time.
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

const { safeSend } = require('./ipc-helpers');

/**
 * Domain-grouped lazy accessor — each domain group loads its managers on
 * first access, then caches the result.  Individual managers are accessed
 * as `domains.io.ptyManager`, `domains.data.sessionManager`, etc.
 */
const domains = {};

lazyProp(domains, 'io',       () => require('./managers').io);
lazyProp(domains, 'data',     () => require('./managers').data);
lazyProp(domains, 'workflow', () => require('./managers').workflow);
lazyProp(domains, 'infra',    () => require('./managers').infra);

/**
 * Names of managers (by domain) that expose a `cleanup()` method and
 * should be torn down when the application closes.
 */
const LIFECYCLE_CLEANUP = [
  { domain: 'data',     name: 'sessionManager' },
  { domain: 'io',       name: 'ptyManager'     },
  { domain: 'io',       name: 'fsManager'      },
  { domain: 'workflow', name: 'flowManager'    },
  { domain: 'data',     name: 'usageManager'   },
];

/**
 * Wire inter-manager dependencies and start runtime services.
 *
 * @param {() => import('electron').BrowserWindow} getWindow
 * @returns {{ targets: Record<string, object>, cleanup: () => void }}
 */
function initManagers(getWindow) {
  const { io, data, workflow, infra } = domains;

  // -- Lifecycle: start managers that need runtime context --
  // Access order matters: updateManager first, then flow, session, usage.
  infra.updateManager.init();
  workflow.flowManager.start(getWindow, io.ptyManager);
  data.sessionManager.start(io.ptyManager);
  data.usageManager.init(data.sessionManager);

  // -- Build target map consumed by IPC dispatching --
  const { shell, clipboard } = require('electron');

  // Adapter: update-manager exposes functional names (checkForUpdates,
  // getVersion, performUpdate); the IPC schema uses shorter aliases
  // (check, version, run) and `run` needs a per-call progress callback.
  const updateTarget = {
    check:    () => infra.updateManager.checkForUpdates(),
    version:  () => infra.updateManager.getVersion(),
    relaunch: () => infra.updateManager.relaunch(),
    run:      () => infra.updateManager.performUpdate((p) => safeSend(getWindow, 'update:progress', p)),
  };

  const targets = {
    pty:       io.ptyManager,
    fs:        io.fsManager,
    git:       infra.gitManager,
    config:    infra.configManager,
    flow:      workflow.flowManager,
    usage:     data.usageManager,
    skills:    workflow.skillsManager,
    update:    updateTarget,
    shell,
    clipboard,
  };

  function cleanup() {
    for (const { domain, name } of LIFECYCLE_CLEANUP) {
      const mod = domains[domain][name];
      if (typeof mod.cleanup === 'function') mod.cleanup();
    }
  }

  return { targets, cleanup, ptyManager: io.ptyManager, sessionManager: data.sessionManager };
}

module.exports = { initManagers };
