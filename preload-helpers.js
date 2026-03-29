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

module.exports = { _onIpc, _fwd, _pack, _createTargetedChannel };
