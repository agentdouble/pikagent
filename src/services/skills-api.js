/**
 * Service layer for skills management operations.
 * Components should import from here instead of calling window.api.skills directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('skills');

export const list        = api.list;
export const getRoot     = api.getRoot;
export const setRoot     = api.setRoot;
export const importSkill = api.import;
export const create      = api.create;
export const deleteSkill = api.delete;
export const read        = api.read;
export const write       = api.write;
