/**
 * Service layer for shell/OS interaction operations.
 * Components should import from here instead of calling window.api.shell directly.
 */
import { createApiService } from './create-api-service.js';
export default createApiService('shell');
