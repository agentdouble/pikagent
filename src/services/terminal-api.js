/**
 * Service layer for pseudo-terminal operations.
 * Components should import from here instead of calling window.api.pty directly.
 */
import { createApiService } from './create-api-service.js';
export default createApiService('pty');
