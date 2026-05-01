/**
 * Service layer for window.api.usage — usage metrics operations.
 * Components should import from here instead of calling window.api.usage directly.
 */

export const getMetrics = (...args) => window.api.usage.getMetrics(...args);
