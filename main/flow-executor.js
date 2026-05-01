/**
 * Flow execution — PTY process management and output collection.
 *
 * Extracted from flow-manager.js to isolate the execution concern.
 * Handles PTY creation, output processing, and orchestration.
 *
 * Logging helpers live in flow-executor-log.js; run-recording
 * helpers live in flow-executor-run.js.
 */

const os = require('os');
const {
  SHELL_INIT_DELAY_MS,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS,
  MAX_FLOW_RUNTIME_MS,
  buildFlowCommand, createOutputProcessor,
} = require('./flow-helpers');
const { saveLog, getRunLog, cleanLogs } = require('./flow-executor-log');
const { recordRun } = require('./flow-executor-run');

// --- Top-level helpers ---

/**
 * Cleans up a finished flow process: clears timeout, removes PTY,
 * and notifies the renderer.
 *
 * @param {{ getPtyManager: Function, sendToWindow: Function }} deps
 * @param {Map} runningFlows
 * @param {string} flowId
 * @param {string} ptyId
 * @param {number} exitCode
 */
function cleanupFlowProcess(deps, runningFlows, flowId, ptyId, exitCode) {
  const entry = runningFlows.get(flowId);
  if (entry?.timeout) clearTimeout(entry.timeout);
  deps.getPtyManager().processes.delete(ptyId);
  runningFlows.delete(flowId);
  deps.sendToWindow('pty:exit', { id: ptyId, exitCode });
  deps.sendToWindow('flow:runComplete', { flowId, ptyId, exitCode });
}

/**
 * Wires up PTY data/exit listeners for a running flow process.
 *
 * @param {{ sendToWindow: Function, getPtyManager: Function, getFlow: Function, saveFlow: Function, log: object }} deps
 * @param {Map} runningFlows
 * @param {object} proc
 * @param {object} flow
 * @param {string} ptyId
 * @param {string} runTimestamp
 */
function setupPtyListeners(deps, runningFlows, proc, flow, ptyId, runTimestamp) {
  const output = createOutputProcessor(flow.agent);

  proc.onData((data) => {
    const formatted = output.processData(data);
    if (formatted) deps.sendToWindow('pty:data', { id: ptyId, data: formatted });
  });

  proc.onExit(async ({ exitCode }) => {
    const remaining = output.flush();
    if (remaining) deps.sendToWindow('pty:data', { id: ptyId, data: remaining });

    cleanupFlowProcess(deps, runningFlows, flow.id, ptyId, exitCode);
    await saveLog(deps, flow.id, runTimestamp, output.getOutput());
    await recordRun(deps, flow.id, exitCode === 0 ? 'success' : 'error', runTimestamp);
  });
}

/**
 * Executes a single flow inside a new PTY process.
 *
 * @param {{ getPtyManager: Function, sendToWindow: Function, log: object, getFlow: Function, saveFlow: Function }} deps
 * @param {Map} runningFlows
 * @param {object} flow
 */
function execute(deps, runningFlows, flow) {
  const ptyManager = deps.getPtyManager();
  if (!ptyManager) return;

  const ptyId = `flow-${flow.id}-${Date.now()}`;
  const cwd = flow.cwd || os.homedir();
  const runTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    const proc = ptyManager.create({
      id: ptyId,
      cwd,
      cols: DEFAULT_PTY_COLS,
      rows: DEFAULT_PTY_ROWS,
    });

    setupPtyListeners(deps, runningFlows, proc, flow, ptyId, runTimestamp);

    // Auto-kill flows that exceed the max runtime
    const timeout = setTimeout(() => {
      console.warn(`Flow ${flow.id} exceeded max runtime (${MAX_FLOW_RUNTIME_MS / 60000}min), killing`);
      ptyManager.kill(ptyId);
    }, MAX_FLOW_RUNTIME_MS);

    runningFlows.set(flow.id, { ptyId, proc, timeout });

    deps.sendToWindow('flow:runStarted', {
      flowId: flow.id,
      ptyId,
      flowName: flow.name,
    });

    const cmd = buildFlowCommand(flow);
    setTimeout(() => {
      ptyManager.write(ptyId, cmd);
    }, SHELL_INIT_DELAY_MS);
  } catch (err) {
    deps.log.error('execution failed', err);
    recordRun(deps, flow.id, 'error', runTimestamp);
  }
}

/**
 * Kills all running flow processes and clears the map.
 *
 * @param {{ getPtyManager: Function }} deps
 * @param {Map} runningFlows
 */
function stopAll(deps, runningFlows) {
  const ptyManager = deps.getPtyManager();
  for (const [, { ptyId, timeout }] of runningFlows) {
    if (timeout) clearTimeout(timeout);
    ptyManager?.kill(ptyId);
  }
  runningFlows.clear();
}

/**
 * Returns a plain object mapping flow IDs to their PTY IDs.
 *
 * @param {Map} runningFlows
 * @returns {Record<string, string>}
 */
function getRunning(runningFlows) {
  return Object.fromEntries(
    [...runningFlows].map(([id, { ptyId }]) => [id, ptyId]),
  );
}

// --- Factory function ---

/**
 * Creates a flow executor bound to external dependencies.
 *
 * @param {{
 *   getPtyManager: () => object | null,
 *   sendToWindow: (channel: string, payload: object) => void,
 *   getFlow: (id: string) => Promise<object | null>,
 *   saveFlow: (flow: object) => Promise<object>,
 *   log: { error: (msg: string, err?: unknown) => void, warn: (msg: string, err?: unknown) => void },
 * }} deps
 * @returns {{
 *   execute: (flow: object) => void,
 *   runningFlows: Map<string, { ptyId: string, proc: object, timeout: ReturnType<typeof setTimeout> }>,
 *   stopAll: () => void,
 *   getRunning: () => Record<string, string>,
 *   getRunLog: (flowId: string, timestamp: string) => Promise<string | null>,
 *   cleanLogs: (flowId: string) => Promise<void>,
 * }}
 */
function createFlowExecutor(deps) {
  const runningFlows = new Map();

  return {
    execute: (flow) => execute(deps, runningFlows, flow),
    runningFlows,
    stopAll: () => stopAll(deps, runningFlows),
    getRunning: () => getRunning(runningFlows),
    getRunLog: (flowId, timestamp) => getRunLog(deps, flowId, timestamp),
    cleanLogs: (flowId) => cleanLogs(deps, flowId),
  };
}

module.exports = { createFlowExecutor };
