/**
 * API adapter factories for TabManager.
 * Extracted from tab-manager.js to reduce component size.
 *
 * Each factory receives raw API handles and returns a plain-object adapter
 * matching the interface expected by downstream flow utilities.
 */

/**
 * Build the open-PR API adapter.
 * @param {{ git: { branch: Function, remoteUrl: Function, pushBranch: Function, ghAvailable: Function, ghPrCreate: Function }, shell: { openExternal: Function } }} api
 * @returns {import('./open-pr-flow.js').OpenPrApi}
 */
export function createPrApi(api) {
  return {
    branch:       (cwd) => api.git.branch(cwd),
    remoteUrl:    (cwd) => api.git.remoteUrl(cwd),
    pushBranch:   ({ cwd, branch }) => api.git.pushBranch(cwd, branch),
    ghAvailable:  () => api.git.ghAvailable(),
    ghPrCreate:   ({ cwd, baseBranch }) => api.git.ghPrCreate(cwd, baseBranch),
    openExternal: (url) => api.shell.openExternal(url),
  };
}

/**
 * Build the git-worktree API adapter.
 * @param {{ isRepo: Function, branch: Function, listBranches: Function, worktreeList: Function, worktreeAdd: Function, worktreeRemove: Function }} git
 * @returns {import('./worktree-flow.js').GitWorktreeApi}
 */
export function createWorktreeApi(git) {
  return {
    isRepo:       (cwd) => git.isRepo(cwd),
    branch:       (cwd) => git.branch(cwd),
    listBranches: (cwd) => git.listBranches(cwd),
    worktreeList: (cwd) => git.worktreeList(cwd),
    worktreeAdd:  ({ cwd, branch, targetPath, createBranch, baseBranch }) =>
      git.worktreeAdd(cwd, branch, targetPath, createBranch, baseBranch),
    worktreeRemove: ({ cwd, worktreePath, force }) =>
      git.worktreeRemove(cwd, worktreePath, force),
  };
}

/**
 * Build a view-store adapter for sidebar management.
 *
 * @param {Record<string, unknown>} self - the TabManager instance (used as a property bag)
 * @returns {import('./sidebar-manager.js').SideViewStore}
 */
export function createViewStore(self) {
  return {
    getView: (key) => self[key],
    setView: (key, val) => { self[key] = val; },
    getContainer: (key) => self[key],
    setContainer: (key, val) => { self[key] = val; },
  };
}
