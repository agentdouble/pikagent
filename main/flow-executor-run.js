/**
 * Flow run recording — appends run results to flow history.
 *
 * Extracted from flow-executor.js to isolate the run-recording concern.
 */

const { MAX_RUN_HISTORY } = require('./flow-helpers');

/**
 * Appends a run record to the flow's history.
 *
 * @param {{ getFlow: Function, saveFlow: Function }} deps
 * @param {string} flowId
 * @param {string} status
 * @param {string} runTimestamp
 */
async function recordRun(deps, flowId, status, runTimestamp) {
  const flow = await deps.getFlow(flowId);
  if (!flow) return;
  const now = new Date().toISOString();
  const runs = flow.runs || [];
  runs.push({
    date: now.slice(0, 10),
    timestamp: now,
    logTimestamp: runTimestamp,
    status,
  });
  flow.runs = runs.length > MAX_RUN_HISTORY ? runs.slice(-MAX_RUN_HISTORY) : runs;
  await deps.saveFlow(flow);
}

module.exports = { recordRun };
