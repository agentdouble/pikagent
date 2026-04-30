/**
 * Flow scheduling — polling and schedule evaluation.
 *
 * Extracted from flow-manager.js to isolate the scheduling concern.
 * The scheduler evaluates which flows should run on each tick and
 * delegates actual execution to a callback provided by the caller.
 */

const { createPollingManager } = require('../shared/polling-manager');
const { SCHEDULER_INTERVAL_MS, shouldRun } = require('./flow-helpers');

/**
 * Creates a flow scheduler that polls at a fixed interval and invokes
 * `executeFn(flow)` for every enabled flow whose schedule is due.
 *
 * @param {{ list: () => Promise<Array<object>>, isRunning: (id: string) => boolean }} flowSource
 *   - list()      — returns all saved flows
 *   - isRunning() — returns true if a flow is already executing
 * @param {(flow: object) => void} executeFn — called for each flow that should run
 * @returns {{ start: () => void, stop: () => void }}
 */
function createFlowScheduler(flowSource, executeFn) {
  async function tick() {
    const now = new Date();
    const flows = await flowSource.list();

    for (const flow of flows) {
      if (!flow.enabled) continue;
      if (flowSource.isRunning(flow.id)) continue;
      if (shouldRun(flow, now)) {
        executeFn(flow);
      }
    }
  }

  const polling = createPollingManager(tick, {
    intervalMs: SCHEDULER_INTERVAL_MS,
  });

  return {
    start() { polling.start(); },
    stop()  { polling.stop(); },
  };
}

module.exports = { createFlowScheduler };
