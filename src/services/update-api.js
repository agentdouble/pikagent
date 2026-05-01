/**
 * Service layer for window.api.update — application update operations.
 * Components should import from here instead of calling window.api.update directly.
 */

export const check      = (...args) => window.api.update.check(...args);
export const run        = (...args) => window.api.update.run(...args);
export const relaunch   = (...args) => window.api.update.relaunch(...args);
export const version    = (...args) => window.api.update.version(...args);
export const onProgress = (...args) => window.api.update.onProgress(...args);
