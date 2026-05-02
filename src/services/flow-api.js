/**
 * Service layer for flow/automation operations.
 * Components should import from here instead of calling window.api.flow directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('flow');

// Alias: consumers use deleteFlow but the IPC method is delete
api.deleteFlow = api.delete;

export default api;
