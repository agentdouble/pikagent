/**
 * Service layer for window.api.flow — flow/automation operations.
 * Components should import from here instead of calling window.api.flow directly.
 */

export const list           = (...args) => window.api.flow.list(...args);
export const save           = (...args) => window.api.flow.save(...args);
export const deleteFlow     = (...args) => window.api.flow.delete(...args);
export const toggle         = (...args) => window.api.flow.toggle(...args);
export const runNow         = (...args) => window.api.flow.runNow(...args);
export const getRunning     = (...args) => window.api.flow.getRunning(...args);
export const getCategories  = (...args) => window.api.flow.getCategories(...args);
export const saveCategories = (...args) => window.api.flow.saveCategories(...args);
export const getRunLog      = (...args) => window.api.flow.getRunLog(...args);
export const onRunStarted   = (...args) => window.api.flow.onRunStarted(...args);
export const onRunComplete  = (...args) => window.api.flow.onRunComplete(...args);
