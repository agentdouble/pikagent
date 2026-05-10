/**
 * Workflow managers — flow orchestration and skills management.
 *
 * Groups managers that handle user-defined automations (flows) and
 * reusable skill definitions so that manager-init.js can import a
 * single module instead of two separate ones.
 */

const flowManager = require('./flow-manager');
const skillsManager = require('./skills-manager');

module.exports = { flowManager, skillsManager };
