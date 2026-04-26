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
 * Execute a git command and return { ok: true } on success or
 * { ok: false, error } on failure. Centralises the try/catch + log.warn
 * pattern shared by worktreeAdd, worktreeRemove and pushBranch.
 *
 * @param {string} cwd  - working directory
 * @param {string[]} args - arguments passed to `git`
 * @param {string} label - human-readable label for the log message
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function executeGitCommand(cwd, args, label) {
  try {
    await execFileAsync('git', args, execOpts(cwd));
    return { ok: true };
  } catch (err) {
    log.warn(`${label} failed`, err);
    return { ok: false, error: _errorMessage(err) };
  }
}

/**
 * Add a worktree. When `createBranch` is true, creates a new branch named
 * `branch` (optionally starting from `baseBranch`, defaulting to HEAD) at
 * `targetPath`. Otherwise checks out the existing `branch`.
 * Returns { ok: boolean, error?: string }.
 */
async function worktreeAdd(cwd, branch, targetPath, createBranch, baseBranch) {
  const args = createBranch
    ? ['worktree', 'add', '-b', branch, targetPath, ...(baseBranch ? [baseBranch] : [])]
    : ['worktree', 'add', targetPath, branch];
  return executeGitCommand(cwd, args, `worktree add ${branch} → ${targetPath}`);
}

/**
 * Remove a worktree. With `force=true`, passes --force (allows removing
 * worktrees with uncommitted changes).
 * Returns { ok: boolean, error?: string }.
 */
async function worktreeRemove(cwd, worktreePath, force) {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(worktreePath);
  return executeGitCommand(cwd, args, `worktree remove ${worktreePath}`);
}

async function getRemoteUrl(cwd) {
  return runGit(cwd, ['config', '--get', 'remote.origin.url']);
}

async function pushBranch(cwd, branch) {
  return executeGitCommand(cwd, ['push', '-u', 'origin', branch], `push ${branch}`);
}

// ---------------------------------------------------------------------------
// GitHub CLI (gh) integration — used to create PRs directly from the app
// ---------------------------------------------------------------------------

/** Probe whether the `gh` binary is available on PATH. */
async function ghAvailable() {
  try {
    await execFileAsync('gh', ['--version'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extract the first https:// URL appearing in a string — useful for both
 * success stdout (which ends with the PR URL) and error stderr (which embeds
 * the existing PR URL when one already exists).
 */
function _firstUrl(text) {
  if (!text) return null;
  const m = text.match(/https:\/\/\S+/);
  return m ? m[0] : null;
}

/**
 * Create a pull request via the `gh` CLI. Uses `--fill` so gh derives title
 * and body from the commit log. Also pushes the branch if it isn't on remote
 * yet (gh handles that automatically).
 *
 * Returns:
 *   { ok: true,  url }                — PR created
 *   { ok: true,  url, existed: true } — a PR was already open for this branch
 *   { ok: false, error, code }        — gh missing or failed
 *     code values: 'gh-not-installed' | 'not-authed' | 'other'
 */
async function ghPrCreate(cwd, baseBranch) {
  const args = ['pr', 'create', '--fill'];
  if (baseBranch) args.push('--base', baseBranch);
  try {
    const { stdout } = await execFileAsync('gh', args, execOpts(cwd));
    const url = _firstUrl(stdout) || stdout.trim().split('\n').pop();
    return { ok: true, url };
  } catch (err) {
    if (err?.code === 'ENOENT') return { ok: false, code: 'gh-not-installed', error: 'gh CLI not installed' };

    const stderr = err?.stderr?.toString() || '';
    const existingUrl = _firstUrl(stderr);
    if (existingUrl && /already exists/i.test(stderr)) {
      return { ok: true, url: existingUrl, existed: true };
    }

    const code = /not logged|authentication/i.test(stderr) ? 'not-authed' : 'other';
    log.warn(`gh pr create failed`, err);
    return { ok: false, code, error: _errorMessage(err) };
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
  remoteUrl: getRemoteUrl,
  pushBranch,
  ghAvailable,
  ghPrCreate,
};
