/**
 * Service layer for git operations.
 * Components should import from here instead of calling window.api.git directly.
 */
import { createApiService } from './create-api-service.js';
export default createApiService('git');
