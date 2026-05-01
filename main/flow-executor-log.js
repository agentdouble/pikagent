/**
 * Flow log persistence — save, read, and clean up flow run logs.
 *
 * Extracted from flow-executor.js to isolate the logging concern.
 */

const fsp = require('fs/promises');
const path = require('path');
const { logPath } = require('./flow-helpers');
const { ensureDirOnce } = require('./fs-utils');
const { LOGS_DIR } = require('./paths');
const { trySafe } = require('./logger');

const ensureLogsDir = ensureDirOnce(LOGS_DIR);

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
 * Removes all log files for a given flow.
 *
 * @param {{ log: object }} deps
 * @param {string} flowId
 */
async function cleanLogs(deps, flowId) {
  await trySafe(
    async () => {
      const files = (await fsp.readdir(LOGS_DIR)).filter((f) => f.startsWith(flowId + '_'));
      await Promise.all(files.map((f) => fsp.unlink(path.join(LOGS_DIR, f))));
    },
    undefined,
    { log: deps.log, label: 'cleanLogs' },
  );
}

module.exports = { saveLog, getRunLog, cleanLogs };
