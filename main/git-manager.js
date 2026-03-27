const { execFile } = require('child_process');
const { promisify } = require('util');
const { DIFF_MAX_BUFFER, execOpts, parseNameStatus, parseUntracked } = require('./git-helpers');

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Run a git command, return trimmed stdout or `fallback` on error. */
async function runGit(cwd, args, { fallback = null, maxBuffer } = {}) {
  try {
    const opts = maxBuffer ? execOpts(cwd, { maxBuffer }) : execOpts(cwd);
    const { stdout } = await execFileAsync('git', args, opts);
    return stdout.trim();
  } catch (err) {
    console.error(`[git-manager] git ${args[0]} failed in ${cwd}:`, err.message);
    return fallback;
  }
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
  try {
    const [stagedRaw, unstagedRaw, untrackedRaw] = await Promise.all([
      runGit(cwd, ['diff', '--cached', '--name-status'], { fallback: '' }),
      runGit(cwd, ['diff', '--name-status'], { fallback: '' }),
      runGit(cwd, ['ls-files', '--others', '--exclude-standard'], { fallback: '' }),
    ]);

    const staged = parseNameStatus(stagedRaw, true);
    const unstaged = parseNameStatus(unstagedRaw, false);
    const untracked = parseUntracked(untrackedRaw);

    return { staged, unstaged, untracked };
  } catch (err) {
    console.error('[git-manager] getLocalChanges failed:', err.message);
    return { staged: [], unstaged: [], untracked: [] };
  }
}

async function getFileDiff(cwd, filePath, isStaged) {
  const args = isStaged ? ['diff', '--cached', '--', filePath] : ['diff', '--', filePath];
  const result = await runGit(cwd, args, { fallback: '', maxBuffer: DIFF_MAX_BUFFER });
  return result;
}

module.exports = { getBranch, getRemoteUrl, getLocalChanges, getFileDiff };
