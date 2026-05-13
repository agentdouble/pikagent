/**
 * Shared factory for wrapping async functions with try-catch error handling.
 *
 * IPC handlers use the { success, data, error } shape.
 * Lower-level helpers (wrapSafe, trySafe) are unified via createSafeWrapper
 * which itself delegates to runSafe.
 */

/**
 * Core primitive: run `fn`, return its result on success, or call `onError`
 * with the caught Error on failure.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {(err: Error) => T} onError
 * @returns {Promise<T>}
 */
async function runSafe(fn, onError) {
  try {
    return await fn();
  } catch (err) {
    return onError(err);
  }
}

/**
 * Configurable factory that returns a higher-order wrapper around async fns.
 *
 * The returned wrapper catches errors and applies the configured strategy:
 *
 * - `envelope` (default false): when true, wraps success results in
 *   `{ success: true, data }` and errors in `{ error: message }`.
 *   When false, returns the raw result on success and `{ error: message }` on
 *   failure (passthrough mode).
 * - `defaultValue`: if provided, returned instead of an error object on failure.
 * - `log` + `label`: if both provided, `log.warn('<label> failed', err)` is
 *   called on failure.
 *
 * @param {{ envelope?: boolean, defaultValue?: unknown, log?: { warn: Function }, label?: string }} [opts]
 * @returns {(fn: (...args: unknown[]) => Promise<unknown>) => (...args: unknown[]) => Promise<unknown>}
 */
function createSafeWrapper({ envelope = false, defaultValue, log, label } = {}) {
  const hasDefault = arguments.length > 0 && 'defaultValue' in (arguments[0] || {});

  return function wrap(fn) {
    return function (...args) {
      return runSafe(
        () => {
          const result = fn(...args);
          if (!envelope) return result;
          // Envelope mode: wrap in { success, data }
          return Promise.resolve(result).then((r) =>
            r === undefined ? { success: true } : { success: true, data: r },
          );
        },
        (err) => {
          if (log && label) log.warn(`${label} failed`, err);
          if (hasDefault) return defaultValue;
          return { error: err.message };
        },
      );
    };
  };
}

/**
 * Factory that returns a wrapped async function.
 * On success: returns { success: true, data: <result> }.
 * On failure: returns { error: <message> }.
 *
 * Intended for IPC handlers that need a uniform {success/error} envelope.
 *
 * @param {(...args: unknown[]) => Promise<unknown>} asyncFn
 * @returns {(...args: unknown[]) => Promise<{ success: true, data: unknown } | { error: string }>}
 */
const createSafeHandler = createSafeWrapper({ envelope: true });

module.exports = { runSafe, createSafeWrapper, createSafeHandler };
