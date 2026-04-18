/**
 * Factory for creating a polling manager with start / stop / cleanup lifecycle.
 *
 * Both FlowManager and SessionManager share an identical pattern:
 *   1. Create a PollingTimer in the constructor
 *   2. start() — store external deps, optionally run async init, start polling
 *   3. stop()  — stop polling, optionally run teardown
 *   4. cleanup() — alias for stop()
 *
 * This helper encapsulates that boilerplate.
 *
 * @param {() => void|Promise<void>} pollFn - The function invoked on each tick
 * @param {{ intervalMs: number,
 *           onStop?: () => void,
 *           onStart?: () => Promise<void>|void }} opts
 * @returns {{ start: () => Promise<void>, stop: () => void, cleanup: () => void, poller: PollingTimer }}
 */
const { PollingTimer } = require('./polling-timer');

function createPollingManager(pollFn, { intervalMs, onStart, onStop } = {}) {
  const poller = new PollingTimer(intervalMs, pollFn);

  return {
    poller,

    async start() {
      if (onStart) await onStart();
      poller.start();
    },

    stop() {
      poller.stop();
      if (onStop) onStop();
    },

    cleanup() {
      this.stop();
    },
  };
}

module.exports = { createPollingManager };
