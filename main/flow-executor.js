/**
 * Flow execution — PTY process management and output collection.
 *
 * Extracted from flow-manager.js to isolate the execution concern.
 * Handles PTY creation, output processing, log persistence, and
 * run-record bookkeeping.
 */

const fsp = require('fs/promises');
const os = require('os');
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
 * }}
 */
function createFlowExecutor(deps) {
  const { getPtyManager, sendToWindow, getFlow, saveFlow, log } = deps;
  const runningFlows = new Map();

  // --- Log helpers ---

  async function saveLog(flowId, runTimestamp, output) {
    await ensureLogsDir();
    await trySafe(
      () => fsp.writeFile(logPath(flowId, runTimestamp), output, 'utf-8'),
      undefined,
      { log, label: 'saveLog' },
    );
  }

  async function getRunLog(flowId, timestamp) {
    return trySafe(
      () => fsp.readFile(logPath(flowId, timestamp), 'utf-8'),
      null,
      { log, label: 'getRunLog' },
    );
  }

  // --- Run recording ---

  async function recordRun(flowId, status, runTimestamp) {
    const flow = await getFlow(flowId);
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
    await saveFlow(flow);
  }

  // --- PTY lifecycle ---

  function cleanupFlowProcess(flowId, ptyId, exitCode) {
    const entry = runningFlows.get(flowId);
    if (entry?.timeout) clearTimeout(entry.timeout);
    getPtyManager().processes.delete(ptyId);
    runningFlows.delete(flowId);
    sendToWindow('pty:exit', { id: ptyId, exitCode });
    sendToWindow('flow:runComplete', { flowId, ptyId, exitCode });
  }

  function setupPtyListeners(proc, flow, ptyId, runTimestamp) {
    const output = createOutputProcessor(flow.agent);

    proc.onData((data) => {
      const formatted = output.processData(data);
      if (formatted) sendToWindow('pty:data', { id: ptyId, data: formatted });
    });

    proc.onExit(async ({ exitCode }) => {
      const remaining = output.flush();
      if (remaining) sendToWindow('pty:data', { id: ptyId, data: remaining });

      cleanupFlowProcess(flow.id, ptyId, exitCode);
      await saveLog(flow.id, runTimestamp, output.getOutput());
      await recordRun(flow.id, exitCode === 0 ? 'success' : 'error', runTimestamp);
    });
  }

  // --- Main execution entry point ---

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

      setupPtyListeners(proc, flow, ptyId, runTimestamp);

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
      recordRun(flow.id, 'error', runTimestamp);
    }
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
    getRunLog,
  };
}

module.exports = { createFlowExecutor };
