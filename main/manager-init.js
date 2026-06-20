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
 * Each manager is imported directly from its own module (the former
 * managers.js barrel has been inlined — see #462).
 */

/**
 * Define a lazy, self-caching property on `obj`.
 *
 * On first access the `factory` callback is invoked and its return value
 * replaces the getter with a plain data property, so subsequent reads are
 * zero-cost.
 *
 * @param {Record<string, unknown>} obj      Target object.
 * @param {string} name     Property name.
 * @param {() => unknown} factory  Called once to produce the value.
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
 * Lazy accessor object — each property loads its manager on first access,
 * then caches the result by replacing itself with a plain data property.
 *
 * Manager module map: maps property name to { module, instantiate? }.
 * When `instantiate` is true the module export is a constructor and must
 * be called with `new`.
 */
const MANAGER_DEFS = {
  agentMonitorManager: { module: './agent-monitor-manager' },
  ptyManager:     { module: './pty-manager',     instantiate: true },
  fsManager:      { module: './fs-manager' },
  sessionManager: { module: './session-manager' },
  usageManager:   { module: './usage-manager' },
  flowManager:    { module: './flow-manager' },
  loopManager:    { module: './loop-manager' },
  skillsManager:  { module: './skills-manager' },
  gitManager:     { module: './git-manager' },
  configManager:  { module: './config-manager' },
  updateManager:  { module: './update-manager' },
};

const ALL_MANAGER_NAMES = Object.keys(MANAGER_DEFS);

const managers = {};

for (const [name, def] of Object.entries(MANAGER_DEFS)) {
  lazyProp(managers, name, () => {
    const mod = require(def.module);
    return def.instantiate ? new mod() : mod;
  });
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
  'loopManager',
  'usageManager',
];

// Guard: verify every lifecycle name maps to a known manager property.
for (const name of LIFECYCLE_NAMES) {
  if (!ALL_MANAGER_NAMES.includes(name)) {
    throw new Error(`LIFECYCLE_NAMES contains unknown manager: "${name}"`);
  }
}

/**
 * Build the IPC adapter for the update domain.
 *
 * Adapter: update-manager exposes functional names (checkForUpdates,
 * getVersion, performUpdate); the IPC schema uses shorter aliases
 * (check, version, run) and `run` needs a per-call progress callback.
 *
 * @param {Record<string, object>} managers  Lazy manager accessor object.
 * @param {() => import('electron').BrowserWindow} getWindow
 * @returns {Record<string, () => string | void | Promise<unknown>>}
 */
function buildUpdateTarget(managers, getWindow) {
  return {
    info:     () => managers.updateManager.getUpdateInfo(),
    check:    () => managers.updateManager.checkForUpdates(),
    version:  () => managers.updateManager.getVersion(),
    relaunch: () => managers.updateManager.relaunch(),
    run:      () => managers.updateManager.performUpdate((p) => safeSend(getWindow, 'update:progress', p)),
  };
}

/**
 * Build the IPC adapter for the shell domain.
 *
 * Adapter: api-schema's `shell:showInFolder` channel maps to Electron's
 * `shell.showItemInFolder`.
 *
 * @returns {Record<string, (arg: string) => void | Promise<string | void>>}
 */
function buildShellTarget() {
  const { shell } = require('electron');
  return {
    showInFolder: (p) => shell.showItemInFolder(p),
    openExternal: (url) => shell.openExternal(url),
    openPath:     (p) => shell.openPath(p),
  };
}

/**
 * Build the IPC adapter for the clipboard domain.
 *
 * Adapter: `clipboard:write` (string arg) maps to `clipboard.writeText` —
 * Electron's `clipboard.write` only accepts an object payload.
 *
 * @returns {Record<string, (text: string) => void>}
 */
function buildClipboardTarget() {
  const { clipboard } = require('electron');
  return {
    write: (text) => clipboard.writeText(text),
  };
}

/**
 * Wire inter-manager dependencies and start runtime services.
 *
 * @param {() => import('electron').BrowserWindow} getWindow
 * @param {{ installBundledSkills?: boolean }} [options]
 * @returns {{ targets: Record<string, object>, cleanup: () => void }}
 */
function initManagers(getWindow, options = {}) {
  // -- Lifecycle: start managers that need runtime context --
  // Access order matters: updateManager first, then flow, session, usage.
  managers.updateManager.init();
  if (options.installBundledSkills) {
    managers.skillsManager.installPickagentSkill();
  }
  managers.flowManager.start(getWindow, managers.ptyManager);
  managers.sessionManager.start(managers.ptyManager);
  managers.usageManager.init(managers.sessionManager);

  // -- Build target map consumed by IPC dispatching --
  const targets = {
    agents:    managers.agentMonitorManager,
    pty:       managers.ptyManager,
    fs:        managers.fsManager,
    git:       managers.gitManager,
    config:    managers.configManager,
    flow:      managers.flowManager,
    loop:      managers.loopManager,
    usage:     managers.usageManager,
    skills:    managers.skillsManager,
    update:    buildUpdateTarget(managers, getWindow),
    shell:     buildShellTarget(),
    clipboard: buildClipboardTarget(),
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
