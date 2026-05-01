/**
 * Service layer for window.api.git — git operations.
 * Components should import from here instead of calling window.api.git directly.
 */

export const branch         = (...args) => window.api.git.branch(...args);
export const localChanges   = (...args) => window.api.git.localChanges(...args);
export const fileDiff       = (...args) => window.api.git.fileDiff(...args);
export const remoteUrl      = (...args) => window.api.git.remoteUrl(...args);
export const pushBranch     = (...args) => window.api.git.pushBranch(...args);
export const ghAvailable    = (...args) => window.api.git.ghAvailable(...args);
export const ghPrCreate     = (...args) => window.api.git.ghPrCreate(...args);
export const isRepo         = (...args) => window.api.git.isRepo(...args);
export const listBranches   = (...args) => window.api.git.listBranches(...args);
export const worktreeList   = (...args) => window.api.git.worktreeList(...args);
export const worktreeAdd    = (...args) => window.api.git.worktreeAdd(...args);
export const worktreeRemove = (...args) => window.api.git.worktreeRemove(...args);
