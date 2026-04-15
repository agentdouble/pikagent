/**
 * Shared factory for wrapping async functions with try-catch error handling.
 *
 * IPC handlers use the { success, data, error } shape.
 * Lower-level helpers (safeAsync, trySafe) are unified via runSafe.
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
 * Factory that returns a wrapped async function.
 * On success: returns { success: true, data: <result> }.
 * On failure: returns { error: <message> }.
 *
 * Intended for IPC handlers that need a uniform {success/error} envelope.
 *
 * @param {(...args: unknown[]) => Promise<unknown>} asyncFn
 * @returns {(...args: unknown[]) => Promise<{ success: true, data: unknown } | { error: string }>}
 */
function createSafeHandler(asyncFn) {
  return async (...args) => {
    try {
      const result = await asyncFn(...args);
      return { success: true, data: result };
    } catch (err) {
      return { error: err.message };
    }
  };
}

module.exports = { runSafe, createSafeHandler };
