const { execFile } = require('child_process');
const { promisify } = require('util');
const { DIFF_MAX_BUFFER, execOpts, parseNameStatus, parseUntracked } = require('./git-helpers');
const { createLogger, trySafe } = require('./logger');

const log = createLogger('git-manager');
const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a git command, return trimmed stdout or `fallback` on error. */
async function runGit(cwd, args, { fallback = null, maxBuffer } = {}) {
  return trySafe(
    async () => {
      const opts = maxBuffer ? execOpts(cwd, { maxBuffer }) : execOpts(cwd);
      const { stdout } = await execFileAsync('git', args, opts);
      return stdout.trim();
    },
    fallback,
    { log, label: `git ${args[0]} in ${cwd}` },
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

async function getBranch(cwd) {
  return runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
}

async function getRemoteUrl(cwd) {
  return runGit(cwd, ['config', '--get', 'remote.origin.url']);
}

async function getLocalChanges(cwd) {
  return trySafe(
    async () => {
      const [stagedRaw, unstagedRaw, untrackedRaw] = await Promise.all([
        runGit(cwd, ['diff', '--cached', '--name-status'], { fallback: '' }),
        runGit(cwd, ['diff', '--name-status'], { fallback: '' }),
        runGit(cwd, ['ls-files', '--others', '--exclude-standard'], { fallback: '' }),
      ]);

      return {
        staged: parseNameStatus(stagedRaw, true),
        unstaged: parseNameStatus(unstagedRaw, false),
        untracked: parseUntracked(untrackedRaw),
      };
    },
    { staged: [], unstaged: [], untracked: [] },
    { log, label: 'getLocalChanges' },
  );
}

async function getFileDiff(cwd, filePath, isStaged) {
  const args = isStaged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];
  const result = await runGit(cwd, args, { fallback: '', maxBuffer: DIFF_MAX_BUFFER });
  return result;
}

module.exports = {
  // Method aliases matching channel suffixes (git:branch → branch, etc.)
  branch: getBranch,
  remote: getRemoteUrl,
  localChanges: getLocalChanges,
  fileDiff: getFileDiff,
};
