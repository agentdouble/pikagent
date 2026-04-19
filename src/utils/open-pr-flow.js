/**
 * Open-PR flow.
 *
 * For the current branch of a repo, push to origin (with upstream tracking)
 * and open the GitHub compare URL in the default browser so the user lands
 * directly on the "Create pull request" form.
 */

import { showConfirmDialog } from './dom-dialogs.js';
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
 *   openExternal: (url: string) => void | Promise<unknown>,
 * }} OpenPrApi
 */

async function _alert(msg) {
  await showConfirmDialog(msg, { confirmLabel: 'OK', cancelLabel: 'Close' });
}

/**
 * Drive the open-PR flow end-to-end for a given repo cwd.
 *
 * @param {{ cwd: string, baseBranch?: string|null, api: OpenPrApi }} opts
 */
export async function openPrFlow({ cwd, baseBranch = null, api }) {
  const [branch, remote] = await Promise.all([api.branch(cwd), api.remoteUrl(cwd)]);

  if (!branch) {
    await _alert(_el('p', null, 'No git branch detected in ', _el('code', null, cwd)));
    return;
  }
  if (!remote) {
    await _alert(_el('p', null, 'No ', _el('code', null, 'origin'), ' remote configured.'));
    return;
  }

  const parsed = parseRemoteUrl(remote);
  if (!parsed) {
    await _alert(_el('p', null, 'Could not parse remote URL: ', _el('code', null, remote)));
    return;
  }

  const url = buildPrUrl(parsed, branch, baseBranch);
  if (!url) {
    await _alert(_el('p', null, 'Unsupported git provider: ', _el('code', null, parsed.host)));
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
    await _alert(_el('p', null, 'Push failed: ', _el('code', null, push?.error || 'unknown error')));
    return;
  }

  await api.openExternal(url);
}
