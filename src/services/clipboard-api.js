/**
 * Service layer for window.api.clipboard — clipboard operations.
 * Components should import from here instead of calling window.api.clipboard directly.
 */

export const write = (...args) => window.api.clipboard.write(...args);
