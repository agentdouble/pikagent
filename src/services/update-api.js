/**
 * Service layer for application update operations.
 * Components should import from here instead of calling window.api.update directly.
 */
import { createApiService } from './create-api-service.js';
export default createApiService('update');
