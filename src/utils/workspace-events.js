/**
 * Workspace domain events — layout coordination, workspace lifecycle,
 * and user-action events for workspace/file operations.
 *
 * Provides typed event constants and narrow subscription/emission APIs
 * so that the implicit event contracts are discoverable and traceable.
 *
 * @module workspace-events
 * @see event-bus.js (singleton bus instance)
 */

import { createTypedEvent } from './event-bus.js';

// ── Event constants ─────────────────────────────────────────────────

/**
 * Workspace-domain event name constants.
 * @readonly
 * @enum {string}
 */
const WORKSPACE_EVENTS = {
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

// ── Typed helpers (generated via factory) ───────────────────────────

const layoutChanged = createTypedEvent(WORKSPACE_EVENTS.LAYOUT_CHANGED);
const activated = createTypedEvent(WORKSPACE_EVENTS.ACTIVATED);
const openFromFolder = createTypedEvent(WORKSPACE_EVENTS.OPEN_FROM_FOLDER);
const createWorktree = createTypedEvent(WORKSPACE_EVENTS.CREATE_WORKTREE);
const openPr = createTypedEvent(WORKSPACE_EVENTS.OPEN_PR);
const fileOpen = createTypedEvent(WORKSPACE_EVENTS.FILE_OPEN);

/** @param {(data: undefined) => void} cb */
export const onLayoutChanged = layoutChanged.on;
/** Emit layout:changed (no payload). */
export const emitLayoutChanged = layoutChanged.emit;

/** @param {(data: undefined) => void} cb */
export const onWorkspaceActivated = activated.on;
/** Emit workspace:activated (no payload). */
export const emitWorkspaceActivated = activated.emit;

/** @param {(data: { cwd: string }) => void} cb */
export const onWorkspaceOpenFromFolder = openFromFolder.on;
/** @param {{ cwd: string }} data */
export const emitWorkspaceOpenFromFolder = openFromFolder.emit;

/** @param {(data: { repoCwd: string }) => void} cb */
export const onWorkspaceCreateWorktree = createWorktree.on;
/** @param {{ repoCwd: string }} data */
export const emitWorkspaceCreateWorktree = createWorktree.emit;

/** @param {(data: { repoCwd: string }) => void} cb */
export const onWorkspaceOpenPr = openPr.on;
/** @param {{ repoCwd: string }} data */
export const emitWorkspaceOpenPr = openPr.emit;

/** @param {(data: { path: string, name: string }) => void} cb */
export const onFileOpen = fileOpen.on;
/** @param {{ path: string, name: string }} data */
export const emitFileOpen = fileOpen.emit;
