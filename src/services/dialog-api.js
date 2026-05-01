/**
 * Service layer for window.api.dialog — native dialog operations.
 * Components should import from here instead of calling window.api.dialog directly.
 */

export const openFolder = (...args) => window.api.dialog.openFolder(...args);
