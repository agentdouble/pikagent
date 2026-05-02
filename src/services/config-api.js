/**
 * Service layer for workspace config operations.
 * Components should import from here instead of calling window.api.config directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('config');

export const save        = api.save;
export const load        = api.load;
export const list        = api.list;
export const deleteConfig = api.delete;
export const setDefault  = api.setDefault;
export const getDefault  = api.getDefault;
export const loadDefault = api.loadDefault;
