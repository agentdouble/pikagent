const { trySafe } = require('./safe-handler');

/**
 * Lightweight logger factory for main-process modules.
 * Standardises log format: [module] message
 *
 * @param {string} module - module name shown in the prefix
 * @returns {{ info: (msg: string, err?: unknown) => void, warn: (msg: string, err?: unknown) => void, error: (msg: string, err?: unknown) => void }}
 */
function createLogger(module) {
  const prefix = `[${module}]`;

  function formatErr(err) {
    return err instanceof Error ? err.message : (err ?? '');
  }

  return {
    info(msg, err) {
      console.log(prefix, msg, formatErr(err));
    },
    warn(msg, err) {
      console.warn(prefix, msg, formatErr(err));
    },
    error(msg, err) {
      console.error(prefix, msg, formatErr(err));
    },
  };
}

// Re-export trySafe from safe-handler.js so existing consumers that import
// { trySafe } from './logger' continue to work without changes.
module.exports = { createLogger, trySafe };
