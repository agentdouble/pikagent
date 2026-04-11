/**
 * Shared flow utilities used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 */

/**
 * Return the last run from a flow's runs array, or null if none.
 * @param {{ runs?: Array }} flow
 * @returns {{ date: string, timestamp: string, logTimestamp?: string, status: string }|null}
 */
function getLastRun(flow) {
  return flow.runs?.at(-1) ?? null;
}

module.exports = { getLastRun };
