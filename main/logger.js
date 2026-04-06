/**
 * Lightweight logger factory for main-process modules.
 * Standardises log format: [module] message
 *
 * @param {string} module - module name shown in the prefix
 * @returns {{ warn: Function, error: Function }}
 */
function createLogger(module) {
  const prefix = `[${module}]`;
  return {
    warn(msg, err) {
      console.warn(prefix, msg, err instanceof Error ? err.message : (err ?? ''));
    },
    error(msg, err) {
      console.error(prefix, msg, err instanceof Error ? err.message : (err ?? ''));
    },
  };
}

module.exports = { createLogger };
