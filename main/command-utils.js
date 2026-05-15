/**
 * Shared helper for running external commands via execFile.
 *
 * Consolidates the duplicated promisify(execFile) + trySafe pattern
 * shared by git-manager.js and git-metrics-collector.js.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/**
 * Run an external command and return trimmed stdout, or `fallback` on error.
 *
 * @param {string} cmd          - executable name (e.g. 'git')
 * @param {string[]} args       - command arguments
 * @param {import('child_process').ExecFileOptions} opts - options forwarded to execFile
 * @param {{ fallback?: unknown, trySafe: (fn: () => unknown, defaultValue: unknown, opts: { log: { warn: (msg: string, err?: unknown) => void }, label: string }) => Promise<unknown>, log: { warn: (msg: string, err?: unknown) => void }, label: string }} ctx
 *   trySafe - the trySafe wrapper to use for error handling
 *   log     - logger instance
 *   label   - human-readable label for the log message
 * @returns {Promise<string|unknown>}
 */
async function runCommand(cmd, args, opts, { fallback = null, trySafe, log, label }) {
  return trySafe(
    async () => {
      const { stdout } = await execFileAsync(cmd, args, opts);
      return stdout.trim();
    },
    fallback,
    { log, label },
  );
}

module.exports = { execFileAsync, runCommand };
