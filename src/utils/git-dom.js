/**
 * DOM re-exports for the git/worktree domain.
 *
 * Git-related modules (worktree-flow, worktree-dialog, open-pr-flow) import
 * DOM primitives through this facade instead of reaching into the core dom.js
 * hub directly.  This reduces dom.js fan-in.
 */
export { _el, createActionButton } from './dom.js';
