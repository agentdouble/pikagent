/**
 * Aggregation utilities for the renderer process.
 * Delegates to shared/aggregation-utils.js to avoid duplicating logic.
 */

import { aggregateByKey, groupAndAggregate, countBy } from '../../shared/aggregation-utils.js';

export { aggregateByKey, groupAndAggregate, countBy };
