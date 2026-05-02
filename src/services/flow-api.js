/**
 * Service layer for flow/automation operations.
 * Components should import from here instead of calling window.api.flow directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('flow');

export const list           = api.list;
export const save           = api.save;
export const deleteFlow     = api.delete;
export const toggle         = api.toggle;
export const runNow         = api.runNow;
export const getRunning     = api.getRunning;
export const getCategories  = api.getCategories;
export const saveCategories = api.saveCategories;
export const getRunLog      = api.getRunLog;
export const onRunStarted   = api.onRunStarted;
export const onRunComplete  = api.onRunComplete;
