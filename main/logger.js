/**
 * Lightweight logger factory for main-process modules.
 * Standardises log format: [module] message
 *
 * @param {string} module - module name shown in the prefix
 * @returns {{ info: Function, warn: Function, error: Function }}
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

/**
 * Generic safe-execution wrapper.
 * Runs `fn`, returns its result on success or `defaultValue` on error.
 * Optionally logs failures via a logger's `warn` method.
 *
 * @param {Function} fn - async or sync function to execute
 * @param {*} defaultValue - value returned when fn throws
 * @param {{ log: object, label: string }} [opts] - optional logger & label
 * @returns {Promise<*>}
 */
async function trySafe(fn, defaultValue, { log, label } = {}) {
  try {
    return await fn();
  } catch (err) {
    if (log && label) log.warn(`${label} failed`, err);
    return defaultValue;
  }
}

module.exports = { createLogger, trySafe };
