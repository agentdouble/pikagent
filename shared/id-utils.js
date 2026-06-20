/**
 * Unified ID generation utility used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 */

let counter = 0;
const RAND_LEN = 6;

function generateId(prefix = 'id') {
  return `${prefix}-${++counter}-${Date.now()}-${Math.random().toString(36).slice(2, 2 + RAND_LEN)}`;
}

module.exports = { generateId };
