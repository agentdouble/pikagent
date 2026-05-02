/**
 * Service layer for clipboard operations.
 * Components should import from here instead of calling window.api.clipboard directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('clipboard');

export const write = api.write;
