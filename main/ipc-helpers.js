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
 * @internal Exported for testing only — production code uses registerManagerHandlers().
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
 * @internal Exported for testing only — production code uses registerManagerHandlers().
 * Register forward-style handlers on ipcMain for a given target.
 * @param {object} ipc - Electron ipcMain
 * @param {object} target - The object whose methods will be called
 * @param {Array} entries - Array of [channel, method] tuples
 */
function registerForward(ipc, target, entries) {
  for (const [channel, method] of entries) {
    ipc.handle(channel, (_, arg) => target[method](arg));
  }
}

/**
 * @internal Exported for testing only — production code uses registerManagerHandlers().
 * Register spread-style handlers on ipcMain for a given target.
 * @param {object} ipc - Electron ipcMain
 * @param {object} target - The object whose methods will be called
 * @param {Array} entries - Array of [channel, method, keys] tuples
 */
function registerSpread(ipc, target, entries) {
  for (const [channel, method, keys] of entries) {
    ipc.handle(channel, (_, arg) => target[method](...keys.map(k => arg[k])));
  }
}

/**
 * Register all handlers from FORWARD_TABLE and SPREAD_TABLE in one call.
 * Resolves each domain from the provided targets map.
 * Method name is derived from the channel (domain:method).
 *
 * @param {object} ipc - Electron ipcMain
 * @param {Object<string, object>} targets - Map of domain -> target object
 * @param {Set<string>} [skip] - Channels to skip (registered as custom handlers elsewhere)
 */
function registerManagerHandlers(ipc, targets, skip = new Set()) {
  for (const [channel, domain] of FORWARD_TABLE) {
    if (skip.has(channel)) continue;
    const target = targets[domain];
    if (!target) continue;
    const method = channel.split(':')[1];
    ipc.handle(channel, (_, arg) => target[method](arg));
  }

  for (const [channel, domain, keys] of SPREAD_TABLE) {
    if (skip.has(channel)) continue;
    const target = targets[domain];
    if (!target) continue;
    const method = channel.split(':')[1];
    ipc.handle(channel, (_, arg) => target[method](...keys.map(k => arg[k])));
  }
}

module.exports = { safeSend, buildTablesFromSchema, registerForward, registerSpread, registerManagerHandlers };
