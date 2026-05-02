/**
 * Service layer for usage metrics operations.
 * Components should import from here instead of calling window.api.usage directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('usage');

export const getMetrics = api.getMetrics;
