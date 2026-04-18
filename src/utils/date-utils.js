/**
 * Date/time utilities for the renderer process.
 * Delegates to shared/date-utils.js to avoid duplicating formatting logic.
 * esbuild resolves the CommonJS require for the renderer bundle.
 */

const { formatDateTime } = require('../../shared/date-utils');

export { formatDateTime };
