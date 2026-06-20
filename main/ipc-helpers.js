/**
 * Pure helpers and declarative handler tables for IPC registration.
 * Channel tables are derived from the shared API_SCHEMA — single source of truth.
 */

const { API_SCHEMA } = require('../api-schema');

/** Send payload to renderer if window is available */
function safeSend(getWindow, channel, payload) {
  const win = getWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

/**
 * @internal
 * Derive FORWARD_TABLE and SPREAD_TABLE from API_SCHEMA.
 *
 * FORWARD_TABLE entries: [channel, domain]
 *   → channels handled via single-arg ipcMain.handle
 *
 * SPREAD_TABLE entries: [channel, domain, keys]
 *   → channels handled via multi-arg spread ipcMain.handle
 *
 * 'on' entries are renderer-only (ipcRenderer.on) and do not appear here.
 */
function buildTablesFromSchema(schema) {
  const forward = [];
  const spread = [];

  for (const [domain, methods] of Object.entries(schema)) {
    for (const [method, def] of Object.entries(methods)) {
      const ch = def.channel || `${domain}:${method}`;
      if (def.type === 'fwd')       forward.push([ch, domain]);
      else if (def.type === 'pack') spread.push([ch, domain, def.keys]);
    }
  }

  return { forward, spread };
}

const { forward: FORWARD_TABLE, spread: SPREAD_TABLE } = buildTablesFromSchema(API_SCHEMA);

/**
 * @internal
 * Generic handler registration — loops over entries and registers an
 * `ipc.handle` for each one, resolving the target object via `resolveTarget`
 * and building the handler via `buildCallback`.
 *
 * The target method name is always derived from the channel (`domain:method`).
 * Entries whose target cannot be resolved are skipped.
 *
 * @param {Electron.IpcMain} ipc
 * @param {Array<[string, string, string[]?]>} entries
 * @param {(entry: [string, string, string[]?]) => (Record<string, (...args: unknown[]) => unknown> | undefined)} resolveTarget
 * @param {(target: Record<string, (...args: unknown[]) => unknown>, method: string, entry: [string, string, string[]?]) => (event: Electron.IpcMainInvokeEvent, arg: unknown) => unknown} buildCallback
 */
function registerHandlers(ipc, entries, resolveTarget, buildCallback) {
  for (const entry of entries) {
    const [channel] = entry;
    const target = resolveTarget(entry);
    if (!target) continue;
    const method = channel.split(':')[1];
    ipc.handle(channel, buildCallback(target, method, entry));
  }
}

/** @internal Forward-style: single arg forwarded directly to `target[method]`. */
function registerForward(ipc, entries, resolveTarget) {
  registerHandlers(ipc, entries, resolveTarget, (target, method) =>
    (_, arg) => target[method](arg),
  );
}

/** @internal Spread-style: keyed args destructured and spread into `target[method]`. */
function registerSpread(ipc, entries, resolveTarget) {
  registerHandlers(ipc, entries, resolveTarget, (target, method, [,, keys]) =>
    (_, arg) => target[method](...keys.map(k => arg[k])),
  );
}

/**
 * Register all handlers from FORWARD_TABLE and SPREAD_TABLE in one call.
 * Resolves each domain from the provided targets map.
 * Method name is derived from the channel (domain:method).
 *
 * @param {Electron.IpcMain} ipc - Electron ipcMain
 * @param {Record<string, Record<string, (...args: unknown[]) => unknown>>} targets - Map of domain -> target object
 * @param {Set<string>} [skip] - Channels to skip (registered as custom handlers elsewhere)
 */
function registerManagerHandlers(ipc, targets, skip = new Set()) {
  // Resolve domain → target object, honoring the skip set.
  const resolveTarget = ([channel, domain]) =>
    skip.has(channel) ? undefined : targets[domain];

  registerForward(ipc, FORWARD_TABLE, resolveTarget);
  registerSpread(ipc, SPREAD_TABLE, resolveTarget);
}

module.exports = { safeSend, registerManagerHandlers };

/** @internal — exposed for unit tests only; not part of the public API. */
module.exports._internals = { buildTablesFromSchema, registerForward, registerSpread };
