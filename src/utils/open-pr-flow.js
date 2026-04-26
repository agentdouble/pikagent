/**
 * Open-PR flow.
 *
 * For the current branch of a repo, push to origin (with upstream tracking)
 * and open the GitHub compare URL in the default browser so the user lands
 * directly on the "Create pull request" form.
 */

import { showConfirmDialog, showErrorAlert } from './dom-dialogs.js';
import { _el } from './dom.js';

/**
 * Parse a remote URL (HTTPS or SSH) into { host, owner, repo }.
 * Returns null when the URL is not recognised.
 *
 *   https://github.com/owner/repo.git  → { host: 'github.com', owner, repo }
 *   git@github.com:owner/repo.git      → same
 *   ssh://git@github.com/owner/repo    → same
 */
export function parseRemoteUrl(url) {
  if (!url) return null;
  const trimmed = url.trim().replace(/\.git$/, '');
  const patterns = [
    /^https?:\/\/(?:[^@]+@)?([^/]+)\/([^/]+)\/(.+)$/,
    /^ssh:\/\/[^@]+@([^/:]+)(?::\d+)?\/([^/]+)\/(.+)$/,
    /^[^@]+@([^:]+):([^/]+)\/(.+)$/,
  ];
  for (const re of patterns) {
    const m = trimmed.match(re);
    if (m) return { host: m[1], owner: m[2], repo: m[3] };
  }
  return null;
}

/** Build a provider-specific URL for opening a new PR/MR from `branch`. */
export function buildPrUrl({ host, owner, repo }, branch, baseBranch) {
  const b = encodeURIComponent(branch);
  if (host.endsWith('github.com')) {
    const base = baseBranch ? `${encodeURIComponent(baseBranch)}...${b}` : b;
    return baseBranch
      ? `https://${host}/${owner}/${repo}/compare/${base}?expand=1`
      : `https://${host}/${owner}/${repo}/pull/new/${b}`;
  }
  if (host.endsWith('gitlab.com')) {
    const q = new URLSearchParams({ 'merge_request[source_branch]': branch });
    if (baseBranch) q.set('merge_request[target_branch]', baseBranch);
    return `https://${host}/${owner}/${repo}/-/merge_requests/new?${q.toString()}`;
  }
  if (host.endsWith('bitbucket.org')) {
    const q = new URLSearchParams({ source: branch });
    if (baseBranch) q.set('dest', baseBranch);
    return `https://${host}/${owner}/${repo}/pull-requests/new?${q.toString()}`;
  }
  return null;
}

/**
 * @typedef {{
 *   branch: (cwd: string) => Promise<string|null>,
 *   remoteUrl: (cwd: string) => Promise<string|null>,
 *   pushBranch: (args: { cwd: string, branch: string }) => Promise<{ ok: boolean, error?: string }>,
 *   ghAvailable: () => Promise<boolean>,
 *   ghPrCreate: (args: { cwd: string, baseBranch: string|null }) => Promise<{ ok: boolean, url?: string, existed?: boolean, code?: string, error?: string }>,
 *   openExternal: (url: string) => void | Promise<unknown>,
 * }} OpenPrApi
 */

async function _alert(msg) {
  await showConfirmDialog(msg, { confirmLabel: 'OK', cancelLabel: 'Close' });
}

/**
 * Try to create a PR via the `gh` CLI. Returns true when handled (success
 * or a clean failure already surfaced to the user); returns false when the
 * caller should fall back to the browser-based flow.
 */
async function _tryGhFlow(cwd, branch, baseBranch, api) {
  if (!(await api.ghAvailable())) return false;

  const proceed = await showConfirmDialog(
    _el('div', null,
      _el('p', null, 'Create a PR for ', _el('code', null, branch),
        baseBranch ? ' → ' : '', baseBranch ? _el('code', null, baseBranch) : '',
        ' using ', _el('code', null, 'gh'), '?'),
      _el('p', { style: { fontSize: '11px', color: 'var(--text-muted)' } },
        'gh will push the branch if needed and fill the title/body from your commits.'),
    ),
    { confirmLabel: 'Create PR', cancelLabel: 'Cancel' },
  );
  if (!proceed) return true;

  const result = await api.ghPrCreate({ cwd, baseBranch });

  if (!result?.ok) {
    if (result?.code === 'gh-not-installed') return false;
    const retryBrowser = await showConfirmDialog(
      _el('div', null,
        _el('p', null, 'gh pr create failed:'),
        _el('pre', { style: { fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'pre-wrap' } },
          result?.error || 'unknown error'),
        _el('p', null, 'Open in browser instead?'),
      ),
      { confirmLabel: 'Open in browser', cancelLabel: 'Close' },
    );
    return !retryBrowser;
  }

  const open = await showConfirmDialog(
    _el('div', null,
      _el('p', null, result.existed ? 'PR already open: ' : 'PR created: ',
        _el('code', null, result.url || '')),
    ),
    { confirmLabel: 'Open in browser', cancelLabel: 'Close' },
  );
  if (open && result.url) await api.openExternal(result.url);
  return true;
}

/**
 * Drive the open-PR flow end-to-end for a given repo cwd.
 *
 * For GitHub repos, attempts `gh pr create` first (no secret management
 * required — uses the user's existing gh auth). Falls back to push + open
 * the compare URL in the browser when gh is unavailable or the host is not
 * GitHub.
 *
 * @param {{ cwd: string, baseBranch?: string|null, api: OpenPrApi }} opts
 */
export async function openPrFlow({ cwd, baseBranch = null, api }) {
  const [branch, remote] = await Promise.all([api.branch(cwd), api.remoteUrl(cwd)]);

  if (!branch) {
    await showErrorAlert('No git branch detected in ', cwd);
    return;
  }
  if (!remote) {
    await _alert(_el('p', null, 'No ', _el('code', null, 'origin'), ' remote configured.'));
    return;
  }

  const parsed = parseRemoteUrl(remote);
  if (!parsed) {
    await showErrorAlert('Could not parse remote URL: ', remote);
    return;
  }

  if (parsed.host.endsWith('github.com')) {
    const handled = await _tryGhFlow(cwd, branch, baseBranch, api);
    if (handled) return;
  }

  const url = buildPrUrl(parsed, branch, baseBranch);
  if (!url) {
    await showErrorAlert('Unsupported git provider: ', parsed.host);
    return;
  }

  const ok = await showConfirmDialog(
    _el('div', null,
      _el('p', null, 'Push ', _el('code', null, branch), ' to ', _el('code', null, 'origin'), ' and open a PR?'),
      _el('p', { style: { fontSize: '11px', color: 'var(--text-muted)' } }, url),
    ),
    { confirmLabel: 'Push & open', cancelLabel: 'Cancel' },
  );
  if (!ok) return;

  const push = await api.pushBranch({ cwd, branch });
  if (!push?.ok) {
    await showErrorAlert('Push failed: ', push?.error);
    return;
  }

  await api.openExternal(url);
}
