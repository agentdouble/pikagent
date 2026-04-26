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
 * Return the list of all declaratively registered IPC channel names.
 * Used by `ipc-handlers.cleanup()` to remove handlers on shutdown.
 *
 * @param {Set<string>} [skip] - Channels to exclude (custom handlers managed separately)
 * @returns {string[]}
 */
function getRegisteredChannels(skip = new Set()) {
  const channels = [];
  for (const [channel] of FORWARD_TABLE) {
    if (!skip.has(channel)) channels.push(channel);
  }
  for (const [channel] of SPREAD_TABLE) {
    if (!skip.has(channel)) channels.push(channel);
  }
  return channels;
}

/**
 * @internal
 * Generic handler registration — loops over entries and registers an
 * `ipc.handle` for each one, using `buildCallback` to create the handler.
 *
 * @param {Electron.IpcMain} ipc
 * @param {Record<string, (...args: unknown[]) => unknown>} target
 * @param {Array} entries
 * @param {(target: object, entry: Array) => (event: any, arg: any) => any} buildCallback
 */
function registerHandlers(ipc, target, entries, buildCallback) {
  for (const entry of entries) {
    const [channel] = entry;
    ipc.handle(channel, buildCallback(target, entry));
  }
}

/** @internal Forward-style: single arg forwarded directly. */
function registerForward(ipc, target, entries) {
  registerHandlers(ipc, target, entries, (t, [, method]) =>
    (_, arg) => t[method](arg),
  );
}

/** @internal Spread-style: keyed args destructured and spread. */
function registerSpread(ipc, target, entries) {
  registerHandlers(ipc, target, entries, (t, [, method, keys]) =>
    (_, arg) => t[method](...keys.map(k => arg[k])),
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
  /**
   * Shared iteration: resolve domain → target, derive method name from
   * channel, then delegate to `buildCallback` for the handler shape.
   */
  function registerFromTable(entries, buildCallback) {
    for (const entry of entries) {
      const [channel, domain] = entry;
      if (skip.has(channel)) continue;
      const target = targets[domain];
      if (!target) continue;
      const method = channel.split(':')[1];
      ipc.handle(channel, buildCallback(target, method, entry));
    }
  }

  registerFromTable(FORWARD_TABLE, (target, method) =>
    (_, arg) => target[method](arg),
  );

  registerFromTable(SPREAD_TABLE, (target, method, [,, keys]) =>
    (_, arg) => target[method](...keys.map(k => arg[k])),
  );
}

module.exports = { safeSend, registerManagerHandlers, getRegisteredChannels };

/** @internal — exposed for unit tests only; not part of the public API. */
module.exports._internals = { buildTablesFromSchema, registerForward, registerSpread };
