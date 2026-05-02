/**
 * Service layer for git operations.
 * Components should import from here instead of calling window.api.git directly.
 */
import { createApiService } from './create-api-service.js';
const api = createApiService('git');

export const branch         = api.branch;
export const localChanges   = api.localChanges;
export const fileDiff       = api.fileDiff;
export const remoteUrl      = api.remoteUrl;
export const pushBranch     = api.pushBranch;
export const ghAvailable    = api.ghAvailable;
export const ghPrCreate     = api.ghPrCreate;
export const isRepo         = api.isRepo;
export const listBranches   = api.listBranches;
export const worktreeList   = api.worktreeList;
export const worktreeAdd    = api.worktreeAdd;
export const worktreeRemove = api.worktreeRemove;
