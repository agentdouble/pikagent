/**
 * Service layer for workspace config operations.
 * Components should import from here instead of calling window.api.config directly.
 */
import { createApiService } from './create-api-service.js';
export default createApiService('config');
