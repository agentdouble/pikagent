/**
 * Service layer for file-system operations.
 * Components should import from here instead of calling window.api.fs directly.
 */
import { createApiService } from './create-api-service.js';
export default createApiService('fs');
