/**
 * Generic aggregation utilities shared across helper modules.
 * Pure functions — no domain-specific logic.
 *
 * Thin re-export layer: all logic lives in shared/aggregation-utils.js
 * for cross-process reuse (main + renderer).
 */

const {
  aggregateByKey,
  groupAndAggregate,
  initializeCounters,
  computeRate,
  computeNumericStats,
  buildMetrics,
} = require('../shared/aggregation-utils');

module.exports = { aggregateByKey, groupAndAggregate, computeRate, computeNumericStats, initializeCounters, buildMetrics };
