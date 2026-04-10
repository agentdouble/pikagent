const { ipcRenderer } = require('electron');

/** Wraps ipcRenderer.on; returns unsubscribe function */
function _onIpc(channel) {
  return (cb) => {
    const listener = (_, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  };
}

/** Single-arg (or no-arg) forward to main process */
const _fwd = (ch) => (arg) => ipcRenderer.invoke(ch, arg);

/** Multi-arg forward: packs positional args into a keyed object */
const _pack = (ch, keys) => (...args) =>
  ipcRenderer.invoke(ch, Object.fromEntries(keys.map((k, i) => [k, args[i]])));

/**
 * Creates a targeted dispatch channel: one ipcRenderer listener routes events
 * to per-ID callback sets.  Replaces the duplicated _dataListeners / _exitListeners
 * pattern with a single factory.
 *
 * @param {string} channel   IPC channel name (e.g. 'pty:data')
 * @param {function} extract transforms the raw payload into { id, value }
 * @returns {(id: string, cb: function) => () => void} subscribe function
 */
function _createTargetedChannel(channel, extract) {
  const listeners = new Map();

  ipcRenderer.on(channel, (_, payload) => {
    const { id, value } = extract(payload);
    const cbs = listeners.get(id);
    if (cbs) for (const cb of cbs) cb(value);
  });

  return (id, cb) => {
    if (!listeners.has(id)) listeners.set(id, new Set());
    listeners.get(id).add(cb);
    return () => {
      const set = listeners.get(id);
      if (set) { set.delete(cb); if (set.size === 0) listeners.delete(id); }
    };
  };
}

/**
 * Build a flat API object from a schema, merging custom overrides.
 *
 * @param {Record<string, Record<string, { type: string, channel?: string, keys?: string[] }>>} schema - domain → method → { type, channel?, keys? }
 * @param {Record<string, Record<string, (...args: unknown[]) => unknown>>} [overrides] - domain → method → handler (for 'custom' entries)
 * @returns {Record<string, Record<string, (...args: unknown[]) => unknown>>} flat API: { domain: { method: handler } }
 */
function buildApiFromSchema(schema, overrides = {}) {
  const api = {};
  for (const [domain, methods] of Object.entries(schema)) {
    const domainApi = {};
    for (const [method, def] of Object.entries(methods)) {
      const ch = def.channel || `${domain}:${method}`;
      if (def.type === 'fwd')       domainApi[method] = _fwd(ch);
      else if (def.type === 'pack') domainApi[method] = _pack(ch, def.keys);
      else if (def.type === 'on')   domainApi[method] = _onIpc(ch);
    }
    // Merge custom overrides for this domain
    if (overrides[domain]) Object.assign(domainApi, overrides[domain]);
    api[domain] = domainApi;
  }
  return api;
}

module.exports = { _createTargetedChannel, buildApiFromSchema };
