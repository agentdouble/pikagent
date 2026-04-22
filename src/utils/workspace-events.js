/**
 * Workspace and layout events — domain-specific event module.
 *
 * Covers layout changes, workspace activation, folder opening,
 * worktree creation, PR opening, and file opening.
 * Each event exposes a typed subscription function (onXxx) and a typed
 * emit function (emitXxx) so that the event contract is explicit and
 * discoverable without reaching for the raw bus.
 *
 * @module workspace-events
 * @see events.js (thin re-export layer for backward compatibility)
 */

import { bus } from './events.js';

// ── Event name constants ────────────────────────────────────────────

export const WORKSPACE_EVENTS = {
  LAYOUT_CHANGED: 'layout:changed',
  WORKSPACE_ACTIVATED: 'workspace:activated',
  WORKSPACE_OPEN_FROM_FOLDER: 'workspace:openFromFolder',
  WORKSPACE_CREATE_WORKTREE: 'workspace:createWorktree',
  WORKSPACE_OPEN_PR: 'workspace:openPr',
  FILE_OPEN: 'file:open',
};

// ── Typed subscription helpers ──────────────────────────────────────
// Each returns an unsubscribe function.

/** @param {(data: undefined) => void} cb */
export const onLayoutChanged = (cb) => bus.on(WORKSPACE_EVENTS.LAYOUT_CHANGED, cb);

/** @param {(data: undefined) => void} cb */
export const onWorkspaceActivated = (cb) => bus.on(WORKSPACE_EVENTS.WORKSPACE_ACTIVATED, cb);

/** @param {(data: { cwd: string }) => void} cb */
export const onWorkspaceOpenFromFolder = (cb) => bus.on(WORKSPACE_EVENTS.WORKSPACE_OPEN_FROM_FOLDER, cb);

/** @param {(data: { repoCwd: string }) => void} cb */
export const onWorkspaceCreateWorktree = (cb) => bus.on(WORKSPACE_EVENTS.WORKSPACE_CREATE_WORKTREE, cb);

/** @param {(data: { repoCwd: string }) => void} cb */
export const onWorkspaceOpenPr = (cb) => bus.on(WORKSPACE_EVENTS.WORKSPACE_OPEN_PR, cb);

/** @param {(data: { path: string, name: string }) => void} cb */
export const onFileOpen = (cb) => bus.on(WORKSPACE_EVENTS.FILE_OPEN, cb);

// ── Typed emit helpers ──────────────────────────────────────────────

/** @param {undefined} [data] */
export const emitLayoutChanged = (data) => bus.emit(WORKSPACE_EVENTS.LAYOUT_CHANGED, data);

/** @param {undefined} [data] */
export const emitWorkspaceActivated = (data) => bus.emit(WORKSPACE_EVENTS.WORKSPACE_ACTIVATED, data);

/** @param {{ cwd: string }} data */
export const emitWorkspaceOpenFromFolder = (data) => bus.emit(WORKSPACE_EVENTS.WORKSPACE_OPEN_FROM_FOLDER, data);

/** @param {{ repoCwd: string }} data */
export const emitWorkspaceCreateWorktree = (data) => bus.emit(WORKSPACE_EVENTS.WORKSPACE_CREATE_WORKTREE, data);

/** @param {{ repoCwd: string }} data */
export const emitWorkspaceOpenPr = (data) => bus.emit(WORKSPACE_EVENTS.WORKSPACE_OPEN_PR, data);

/** @param {{ path: string, name: string }} data */
export const emitFileOpen = (data) => bus.emit(WORKSPACE_EVENTS.FILE_OPEN, data);
