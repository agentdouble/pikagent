/**
 * Flow execution — PTY process management and output collection.
 *
 * Extracted from flow-manager.js to isolate the execution concern.
 * Handles PTY creation, output processing, log persistence, and
 * run-record bookkeeping.
 */

const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  SHELL_INIT_DELAY_MS,
  DEFAULT_PTY_COLS, DEFAULT_PTY_ROWS,
  MAX_FLOW_RUNTIME_MS, MAX_RUN_HISTORY,
  logPath,
  buildFlowCommand, createOutputProcessor,
} = require('./flow-helpers');
const { ensureDirOnce } = require('./fs-utils');
const { LOGS_DIR } = require('./paths');
const { trySafe } = require('./logger');

const ensureLogsDir = ensureDirOnce(LOGS_DIR);

// --- Top-level helpers (extracted from the factory closure) ---

/**
 * Persists the raw output of a flow run to disk.
 *
 * @param {{ log: object }} deps
 * @param {string} flowId
 * @param {string} runTimestamp
 * @param {string} output
 */
async function saveLog(deps, flowId, runTimestamp, output) {
  await ensureLogsDir();
  await trySafe(
    () => fsp.writeFile(logPath(flowId, runTimestamp), output, 'utf-8'),
    undefined,
    { log: deps.log, label: 'saveLog' },
  );
}

/**
 * Reads a previously saved run log from disk.
 *
 * @param {{ log: object }} deps
 * @param {string} flowId
 * @param {string} timestamp
 * @returns {Promise<string | null>}
 */
async function getRunLog(deps, flowId, timestamp) {
  return trySafe(
    () => fsp.readFile(logPath(flowId, timestamp), 'utf-8'),
    null,
    { log: deps.log, label: 'getRunLog' },
  );
}

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
  const { getPtyManager, sendToWindow, log } = deps;
  const runningFlows = new Map();

  function execute(flow) {
    const ptyManager = getPtyManager();
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

      sendToWindow('flow:runStarted', {
        flowId: flow.id,
        ptyId,
        flowName: flow.name,
      });

      const cmd = buildFlowCommand(flow);
      setTimeout(() => {
        ptyManager.write(ptyId, cmd);
      }, SHELL_INIT_DELAY_MS);
    } catch (err) {
      log.error('execution failed', err);
      recordRun(deps, flow.id, 'error', runTimestamp);
    }
  }

  // --- Log cleanup ---

  async function cleanLogs(flowId) {
    await trySafe(
      async () => {
        const files = (await fsp.readdir(LOGS_DIR)).filter((f) => f.startsWith(flowId + '_'));
        await Promise.all(files.map((f) => fsp.unlink(path.join(LOGS_DIR, f))));
      },
      undefined,
      { log, label: 'cleanLogs' },
    );
  }

  // --- Public API ---

  function stopAll() {
    const ptyManager = getPtyManager();
    for (const [, { ptyId, timeout }] of runningFlows) {
      if (timeout) clearTimeout(timeout);
      ptyManager?.kill(ptyId);
    }
    runningFlows.clear();
  }

  function getRunning() {
    return Object.fromEntries(
      [...runningFlows].map(([id, { ptyId }]) => [id, ptyId]),
    );
  }

  return {
    execute,
    runningFlows,
    stopAll,
    getRunning,
    getRunLog: (flowId, timestamp) => getRunLog(deps, flowId, timestamp),
    cleanLogs,
  };
}

module.exports = { createFlowExecutor };
