/**
 * Generic collection utilities shared across helper modules.
 *
 * countBy is re-exported from shared/aggregation-utils.js
 * for cross-process reuse (main + renderer).
 */

const { countBy } = require('../shared/aggregation-utils');

module.exports = { countBy };
