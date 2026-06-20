/**
 * Flow run recording — appends run results to flow history.
 *
 * Extracted from flow-executor.js to isolate the run-recording concern.
 */

const { MAX_RUN_HISTORY } = require('./flow-helpers');
const { nowISO, extractDateString } = require('../shared/date-utils');

/**
 * Appends a run record to the flow's history.
 *
 * @param {{ getFlow: (id: string) => Promise<import('./flow-executor').Flow|null>, saveFlow: (flow: import('./flow-executor').Flow) => Promise<unknown> }} deps
 * @param {string} flowId
 * @param {string} status
 * @param {string} runTimestamp
 */
async function recordRun(deps, flowId, status, runTimestamp) {
  const flow = await deps.getFlow(flowId);
  if (!flow) return;
  const now = nowISO();
  const runs = flow.runs || [];
  runs.push({
    date: extractDateString(now),
    timestamp: now,
    logTimestamp: runTimestamp,
    status,
  });
  flow.runs = runs.length > MAX_RUN_HISTORY ? runs.slice(-MAX_RUN_HISTORY) : runs;
  await deps.saveFlow(flow);
}

module.exports = { recordRun };
