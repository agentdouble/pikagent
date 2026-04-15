/**
 * Aggregation utilities for the renderer process.
 * Delegates to shared/aggregation-utils.js to avoid duplicating logic.
 * esbuild resolves the CommonJS require for the renderer bundle.
 */

const { aggregateByKey, groupAndAggregate, countBy } = require('../../shared/aggregation-utils');

export { aggregateByKey, groupAndAggregate, countBy };
