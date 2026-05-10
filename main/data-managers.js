/**
 * Data managers — session tracking and usage/metrics aggregation.
 *
 * Groups managers that persist and expose runtime data (active sessions,
 * token usage, agent metrics) so that manager-init.js can import a
 * single module instead of two separate ones.
 */

const sessionManager = require('./session-manager');
const usageManager = require('./usage-manager');

module.exports = { sessionManager, usageManager };
