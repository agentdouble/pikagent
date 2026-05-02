/**
 * Service layer for workspace config operations.
 * Components should import from here instead of calling window.api.config directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('config');

// Alias: consumers use deleteConfig but the IPC method is delete
api.deleteConfig = api.delete;

export default api;
