/**
 * Service layer for window.api.shell — shell/OS interaction operations.
 * Components should import from here instead of calling window.api.shell directly.
 */

export const openExternal = (...args) => window.api.shell.openExternal(...args);
export const openPath     = (...args) => window.api.shell.openPath(...args);
export const showInFolder = (...args) => window.api.shell.showInFolder(...args);
