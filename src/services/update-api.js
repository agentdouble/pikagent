/**
 * Service layer for application update operations.
 * Components should import from here instead of calling window.api.update directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('update');

export const check      = api.check;
export const run        = api.run;
export const relaunch   = api.relaunch;
export const version    = api.version;
export const onProgress = api.onProgress;
