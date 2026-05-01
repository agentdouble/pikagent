/**
 * Service layer for window.api.skills — skills management operations.
 * Components should import from here instead of calling window.api.skills directly.
 */

export const list        = (...args) => window.api.skills.list(...args);
export const getRoot     = (...args) => window.api.skills.getRoot(...args);
export const setRoot     = (...args) => window.api.skills.setRoot(...args);
export const importSkill = (...args) => window.api.skills.import(...args);
export const create      = (...args) => window.api.skills.create(...args);
export const deleteSkill = (...args) => window.api.skills.delete(...args);
export const read        = (...args) => window.api.skills.read(...args);
export const write       = (...args) => window.api.skills.write(...args);
