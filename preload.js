const { contextBridge } = require('electron');
const { _createTargetedChannel, buildApiFromSchema } = require('./preload-helpers');
const { API_SCHEMA } = require('./api-schema');

// --- Targeted PTY dispatch (one listener per event, routed by terminal ID) ---

const _onPtyData = _createTargetedChannel('pty:data', ({ id, data }) => ({ id, value: data }));
const _onPtyExit = _createTargetedChannel('pty:exit', ({ id, exitCode }) => ({ id, value: { id, exitCode } }));

// --- Build & expose the renderer API from the declarative schema ---

contextBridge.exposeInMainWorld('api', buildApiFromSchema(API_SCHEMA, {
  pty: { onData: _onPtyData, onExit: _onPtyExit },
}));
