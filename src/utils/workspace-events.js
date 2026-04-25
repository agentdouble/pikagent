/**
 * Workspace domain events -- layout coordination, workspace lifecycle,
 * and user-action events for workspace/file operations.
 *
 * Provides typed event constants and narrow subscription/emission APIs
 * so that the implicit event contracts are discoverable and traceable.
 *
 * @module workspace-events
 * @see events.js (backward-compat re-exports)
 */

import { bus } from './event-bus.js';

// -- Event constants --

/**
 * Workspace-domain event name constants.
 * @readonly
 * @enum {string}
 */
export const WORKSPACE_EVENTS = {
  /** Workspace layout changed (panel resize, split, webview). */
  LAYOUT_CHANGED: 'layout:changed',
  /** Workspace tab activated or re-shown. */
  ACTIVATED: 'workspace:activated',
  /** User requested to open a folder as a new workspace tab. */
  OPEN_FROM_FOLDER: 'workspace:openFromFolder',
  /** User requested to create a git worktree from a folder. */
  CREATE_WORKTREE: 'workspace:createWorktree',
  /** User requested to push current branch and open a PR. */
  OPEN_PR: 'workspace:openPr',
  /** User requested to open a file in the editor. */
  FILE_OPEN: 'file:open',
};

// -- Typed subscription helpers --
// Each returns an unsubscribe function.

/** @param {(data: undefined) => void} cb */
export const onLayoutChanged = (cb) => bus.on(WORKSPACE_EVENTS.LAYOUT_CHANGED, cb);

/** @param {(data: undefined) => void} cb */
export const onWorkspaceActivated = (cb) => bus.on(WORKSPACE_EVENTS.ACTIVATED, cb);

/** @param {(data: { cwd: string }) => void} cb */
export const onWorkspaceOpenFromFolder = (cb) => bus.on(WORKSPACE_EVENTS.OPEN_FROM_FOLDER, cb);

/** @param {(data: { repoCwd: string }) => void} cb */
export const onWorkspaceCreateWorktree = (cb) => bus.on(WORKSPACE_EVENTS.CREATE_WORKTREE, cb);

/** @param {(data: { repoCwd: string }) => void} cb */
export const onWorkspaceOpenPr = (cb) => bus.on(WORKSPACE_EVENTS.OPEN_PR, cb);

/** @param {(data: { path: string, name: string }) => void} cb */
export const onFileOpen = (cb) => bus.on(WORKSPACE_EVENTS.FILE_OPEN, cb);

// -- Typed emission helpers --

/** Emit layout:changed (no payload). */
export const emitLayoutChanged = () => bus.emit(WORKSPACE_EVENTS.LAYOUT_CHANGED);

/** Emit workspace:activated (no payload). */
export const emitWorkspaceActivated = () => bus.emit(WORKSPACE_EVENTS.ACTIVATED);

/** @param {{ cwd: string }} data */
export const emitWorkspaceOpenFromFolder = (data) => bus.emit(WORKSPACE_EVENTS.OPEN_FROM_FOLDER, data);

/** @param {{ repoCwd: string }} data */
export const emitWorkspaceCreateWorktree = (data) => bus.emit(WORKSPACE_EVENTS.CREATE_WORKTREE, data);

/** @param {{ repoCwd: string }} data */
export const emitWorkspaceOpenPr = (data) => bus.emit(WORKSPACE_EVENTS.OPEN_PR, data);

/** @param {{ path: string, name: string }} data */
export const emitFileOpen = (data) => bus.emit(WORKSPACE_EVENTS.FILE_OPEN, data);
