/**
 * Service layer for native dialog operations.
 * Components should import from here instead of calling window.api.dialog directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('dialog');

export const openFolder = api.openFolder;
