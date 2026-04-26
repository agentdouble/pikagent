/**
 * Worktree creation & cleanup flows.
 *
 * Orchestrates the user-visible steps for creating a git worktree from a
 * repo folder and for removing it when the owning tab is closed. The actual
 * git commands run in the main process (see main/git-manager.js); this module
 * only wires the dialog, error reporting, and tab plumbing.
 */

import { showWorktreeDialog } from './worktree-dialog.js';
import { showConfirmDialog, showErrorAlert } from './dom-dialogs.js';
import { _el } from './git-dom.js';

/**
 * Branches to hide from the "existing branch" picker: those already checked
 * out in a worktree (git refuses to add a second worktree for a checked-out
 * branch) plus the current HEAD of the main repo.
 */
function _availableBranches(allBranches, worktrees) {
  const taken = new Set(worktrees.map((w) => w.branch).filter(Boolean));
  return allBranches.filter((b) => !taken.has(b));
}

/**
 * @typedef {{
 *   isRepo: (cwd: string) => Promise<boolean>,
 *   branch: (cwd: string) => Promise<string|null>,
 *   listBranches: (cwd: string) => Promise<string[]>,
 *   worktreeList: (cwd: string) => Promise<Array<{ path: string, branch: string|null }>>,
 *   worktreeAdd: (args: { cwd: string, branch: string, targetPath: string, createBranch: boolean, baseBranch: string|null }) => Promise<{ ok: boolean, error?: string }>,
 *   worktreeRemove: (args: { cwd: string, worktreePath: string, force: boolean }) => Promise<{ ok: boolean, error?: string }>,
 * }} GitWorktreeApi
 */

/**
 * Drive the "create a worktree from a repo folder" flow end-to-end.
 *
 * @param {{ repoCwd: string, api: GitWorktreeApi, createTab: (name: string, cwd: string) => import('./tab-types.js').WorkspaceTab }} opts
 * @returns {Promise<void>}
 */
export async function createWorktreeFlow({ repoCwd, api, createTab }) {
  const isRepo = await api.isRepo(repoCwd);
  if (!isRepo) {
    await showConfirmDialog(
      _el('p', null, 'This folder is not a git repository. Initialize it with ', _el('code', null, 'git init'), ' first.'),
      { confirmLabel: 'OK', cancelLabel: 'Close' },
    );
    return;
  }

  const [branches, worktrees, currentBranch] = await Promise.all([
    api.listBranches(repoCwd),
    api.worktreeList(repoCwd),
    api.branch(repoCwd),
  ]);
  const existing = _availableBranches(branches, worktrees);

  const choice = await showWorktreeDialog({
    repoCwd,
    allBranches: branches,
    existingBranches: existing,
    currentBranch,
  });
  if (!choice) return;

  const result = await api.worktreeAdd({
    cwd: repoCwd,
    branch: choice.branch,
    targetPath: choice.targetPath,
    createBranch: choice.createBranch,
    baseBranch: choice.baseBranch,
  });

  if (!result?.ok) {
    await showErrorAlert('Worktree creation failed: ', result?.error);
    return;
  }

  const tab = createTab(choice.branch, choice.targetPath);
  if (tab) {
    tab.worktree = {
      mainRepoCwd: repoCwd,
      worktreePath: choice.targetPath,
      baseBranch: choice.createBranch ? (choice.baseBranch || currentBranch || null) : null,
    };
  }
}

/**
 * Ask the user whether to remove the worktree that backs a tab, and do it.
 *
 * Called during tab close, AFTER the tab is disposed. Runs best-effort: any
 * git error is surfaced but does not block the close.
 *
 * @param {{ mainRepoCwd: string, worktreePath: string }} worktree
 * @param {string} tabName
 * @param {GitWorktreeApi} api
 * @returns {Promise<void>}
 */
export async function maybeRemoveWorktree(worktree, tabName, api) {
  const remove = await showConfirmDialog(
    _el('p', null,
      'Also remove the git worktree at ',
      _el('code', null, worktree.worktreePath),
      ' ?',
    ),
    { confirmLabel: 'Remove worktree', cancelLabel: 'Keep on disk' },
  );
  if (!remove) return;

  let result = await api.worktreeRemove({
    cwd: worktree.mainRepoCwd,
    worktreePath: worktree.worktreePath,
    force: false,
  });

  if (!result?.ok) {
    const retryForce = await showConfirmDialog(
      _el('p', null,
        'Worktree has uncommitted changes (', _el('code', null, result?.error || 'unknown'),
        '). Remove anyway?',
      ),
      { confirmLabel: 'Force remove', cancelLabel: 'Cancel' },
    );
    if (!retryForce) return;
    result = await api.worktreeRemove({
      cwd: worktree.mainRepoCwd,
      worktreePath: worktree.worktreePath,
      force: true,
    });
  }

  if (!result?.ok) {
    await showErrorAlert('Could not remove worktree: ', result?.error);
  }
}
