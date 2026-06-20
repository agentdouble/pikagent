/**
 * Service layer for flow/automation operations.
 * Components should import from here instead of calling window.api.flow directly.
 */
import { createApiService } from './create-api-service.js';
export default createApiService('flow', { deleteFlow: 'delete' });
