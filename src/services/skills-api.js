/**
 * Service layer for skills management operations.
 * Components should import from here instead of calling window.api.skills directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('skills');

// Aliases: consumers use importSkill/deleteSkill but the IPC methods are import/delete
api.importSkill = api.import;
api.deleteSkill = api.delete;

export default api;
