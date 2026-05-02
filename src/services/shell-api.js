/**
 * Service layer for shell/OS interaction operations.
 * Components should import from here instead of calling window.api.shell directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('shell');

export const openExternal = api.openExternal;
export const openPath     = api.openPath;
export const showInFolder = api.showInFolder;
