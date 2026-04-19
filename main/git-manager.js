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

// ---------------------------------------------------------------------------
// Worktree / branch API
// ---------------------------------------------------------------------------

async function isGitRepo(cwd) {
  const out = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  return out === 'true';
}

async function listBranches(cwd) {
  const raw = await runGit(cwd, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], { fallback: '' });
  if (!raw) return [];
  return raw.split('\n').filter(Boolean);
}

/**
 * Parse `git worktree list --porcelain` output.
 * Blocks separated by blank lines; each block has `worktree <path>`,
 * optional `HEAD <sha>`, `branch <ref>` or `detached`/`bare`.
 */
function parseWorktreeList(raw) {
  if (!raw) return [];
  return raw.split('\n\n').filter(Boolean).map((block) => {
    const info = { path: null, branch: null, head: null, bare: false, detached: false };
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) info.path = line.slice('worktree '.length);
      else if (line.startsWith('HEAD ')) info.head = line.slice('HEAD '.length);
      else if (line.startsWith('branch ')) info.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
      else if (line === 'bare') info.bare = true;
      else if (line === 'detached') info.detached = true;
    }
    return info;
  }).filter((w) => w.path);
}

async function worktreeList(cwd) {
  const raw = await runGit(cwd, ['worktree', 'list', '--porcelain'], { fallback: '' });
  return parseWorktreeList(raw);
}

function _errorMessage(err) {
  const stderr = err?.stderr?.toString().trim();
  return stderr || err?.message || 'git command failed';
}

/**
 * Add a worktree. When `createBranch` is true, creates a new branch from HEAD
 * at `targetPath`. Otherwise checks out an existing branch.
 * Returns { ok: boolean, error?: string }.
 */
async function worktreeAdd(cwd, branch, targetPath, createBranch) {
  try {
    const args = createBranch
      ? ['worktree', 'add', '-b', branch, targetPath]
      : ['worktree', 'add', targetPath, branch];
    await execFileAsync('git', args, execOpts(cwd));
    return { ok: true };
  } catch (err) {
    log.warn(`worktree add ${branch} → ${targetPath} failed`, err);
    return { ok: false, error: _errorMessage(err) };
  }
}

/**
 * Remove a worktree. With `force=true`, passes --force (allows removing
 * worktrees with uncommitted changes).
 * Returns { ok: boolean, error?: string }.
 */
async function worktreeRemove(cwd, worktreePath, force) {
  try {
    const args = ['worktree', 'remove'];
    if (force) args.push('--force');
    args.push(worktreePath);
    await execFileAsync('git', args, execOpts(cwd));
    return { ok: true };
  } catch (err) {
    log.warn(`worktree remove ${worktreePath} failed`, err);
    return { ok: false, error: _errorMessage(err) };
  }
}

module.exports = {
  // Method aliases matching channel suffixes (git:branch → branch, etc.)
  branch: getBranch,
  localChanges: getLocalChanges,
  fileDiff: getFileDiff,
  isRepo: isGitRepo,
  listBranches,
  worktreeList,
  worktreeAdd,
  worktreeRemove,
};
