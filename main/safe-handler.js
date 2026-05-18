/**
 * Shared factory for wrapping async functions with try-catch error handling.
 *
 * Every safe-execution variant in the codebase is built on top of
 * `createSafeWrapper`, the single configurable factory:
 *
 * - `wrapSafe`          – passthrough mode (no envelope, returns `{ error }` on failure)
 * - `createSafeHandler` – IPC envelope mode (`{ success, data }` / `{ error }`)
 * - `trySafe`           – one-shot execution with defaultValue + optional logging
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
 * @param {{ envelope?: boolean, defaultValue?: unknown, log?: { warn: (msg: string, err?: unknown) => void }, label?: string }} [opts]
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

// ---------------------------------------------------------------------------
// Pre-built variants — every safe-execution helper is a thin alias.
// ---------------------------------------------------------------------------

/**
 * Higher-order wrapper: passthrough mode (no envelope).
 * On success returns the result of fn directly.
 * On failure returns { error: err.message }.
 *
 * @param {(...args: unknown[]) => Promise<unknown>} fn - async function to wrap
 * @returns {(...args: unknown[]) => Promise<unknown>} wrapped function with same signature
 */
const wrapSafe = createSafeWrapper();

/**
 * Higher-order wrapper: IPC envelope mode.
 * On success: returns { success: true, data: <result> }.
 * On failure: returns { error: <message> }.
 *
 * @param {(...args: unknown[]) => Promise<unknown>} asyncFn
 * @returns {(...args: unknown[]) => Promise<{ success: true, data: unknown } | { error: string }>}
 */
const createSafeHandler = createSafeWrapper({ envelope: true });

/**
 * One-shot safe execution with a fallback value and optional logging.
 * Runs `fn` once, returns its result on success or `defaultValue` on error.
 *
 * @param {() => unknown} fn - async or sync function to execute
 * @param {unknown} defaultValue - value returned when fn throws
 * @param {{ log?: { warn: (msg: string, err?: unknown) => void }, label?: string }} [opts]
 * @returns {Promise<unknown>}
 */
function trySafe(fn, defaultValue, { log, label } = {}) {
  return createSafeWrapper({ defaultValue, log, label })(fn)();
}

module.exports = { createSafeHandler, wrapSafe, trySafe };
