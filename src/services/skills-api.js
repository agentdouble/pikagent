/**
 * Service layer for skills management operations.
 * Components should import from here instead of calling window.api.skills directly.
 */
import { createApiService } from './create-api-service.js';
export default createApiService('skills');
