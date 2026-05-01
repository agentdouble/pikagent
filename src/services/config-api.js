/**
 * Service layer for window.api.config — workspace config operations.
 * Components should import from here instead of calling window.api.config directly.
 */

export const save        = (...args) => window.api.config.save(...args);
export const load        = (...args) => window.api.config.load(...args);
export const list        = (...args) => window.api.config.list(...args);
export const deleteConfig = (...args) => window.api.config.delete(...args);
export const setDefault  = (...args) => window.api.config.setDefault(...args);
export const getDefault  = (...args) => window.api.config.getDefault(...args);
export const loadDefault = (...args) => window.api.config.loadDefault(...args);
