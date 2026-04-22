/**
 * Tab manager API adapters — extracted from tab-manager.js.
 *
 * These factory functions build narrow API objects consumed by extracted
 * helpers (worktree-flow, open-pr-flow, sidebar-manager) so that the
 * main TabManager class stays focused on orchestration.
 *
 * All functions receive their dependencies via parameters — no direct
 * window.api references.
 */

/**
 * @typedef {{ branch: (cwd: string) => Promise<string|null>, remoteUrl: (cwd: string) => Promise<string|null>, pushBranch: (cwd: string, branch: string) => Promise<{ ok: boolean, error?: string }>, ghAvailable: () => Promise<boolean>, ghPrCreate: (cwd: string, baseBranch: string|null) => Promise<{ ok: boolean, url?: string, existed?: boolean, code?: string, error?: string }> }} GitApi
 * @typedef {{ openExternal: (url: string) => void | Promise<unknown> }} ShellApi
 */

/**
 * Adapter exposing the git + shell surface needed by the open-PR flow.
 * @param {{ git: GitApi, shell: ShellApi }} api — injected API surface
 * @returns {import('./open-pr-flow.js').OpenPrApi}
 */
export function buildPrApi(api) {
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
 * @typedef {{ isRepo: (cwd: string) => Promise<boolean>, branch: (cwd: string) => Promise<string|null>, listBranches: (cwd: string) => Promise<string[]>, worktreeList: (cwd: string) => Promise<Array<{ path: string, branch: string|null }>>, worktreeAdd: (cwd: string, branch: string, targetPath: string, createBranch: boolean, baseBranch: string|null) => Promise<{ ok: boolean, error?: string }>, worktreeRemove: (cwd: string, worktreePath: string, force: boolean) => Promise<{ ok: boolean, error?: string }> }} GitWorktreeIpc
 */

/**
 * Adapter exposing the git-worktree IPC surface as an object-style API,
 * matching {@link import('./worktree-flow.js').GitWorktreeApi}.
 * @param {{ git: GitWorktreeIpc }} api — injected API surface
 * @returns {import('./worktree-flow.js').GitWorktreeApi}
 */
export function buildWorktreeApi(api) {
  return {
    isRepo:       (cwd) => api.git.isRepo(cwd),
    branch:       (cwd) => api.git.branch(cwd),
    listBranches: (cwd) => api.git.listBranches(cwd),
    worktreeList: (cwd) => api.git.worktreeList(cwd),
    worktreeAdd:  ({ cwd, branch, targetPath, createBranch, baseBranch }) =>
      api.git.worktreeAdd(cwd, branch, targetPath, createBranch, baseBranch),
    worktreeRemove: ({ cwd, worktreePath, force }) =>
      api.git.worktreeRemove(cwd, worktreePath, force),
  };
}

/**
 * Build a view store adapter for sidebar-manager.
 * @param {{ [key: string]: unknown }} self — the TabManager instance (or any object holding side-view properties)
 * @returns {import('./sidebar-manager.js').SideViewStore}
 */
export function buildViewStore(self) {
  return {
    getView: (key) => self[key],
    setView: (key, val) => { self[key] = val; },
    getContainer: (key) => self[key],
    setContainer: (key, val) => { self[key] = val; },
  };
}
