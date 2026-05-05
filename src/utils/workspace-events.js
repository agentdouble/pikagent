/**
 * Workspace domain events — layout coordination, workspace lifecycle,
 * and user-action events for workspace/file operations.
 *
 * Provides narrow subscription/emission APIs generated via {@link createTypedEvent}
 * so that the implicit event contracts are discoverable and traceable.
 *
 * @module workspace-events
 * @see event-bus.js (singleton bus instance)
 */

import { createTypedEvent } from './event-bus.js';

// ── layoutChanged ───────────────────────────────────────────────────

const { on: onLayoutChanged, emit: emitLayoutChanged } =
  createTypedEvent('layout:changed');

// ── activated ───────────────────────────────────────────────────────

const { on: onWorkspaceActivated, emit: emitWorkspaceActivated } =
  createTypedEvent('workspace:activated');

// ── openFromFolder ──────────────────────────────────────────────────

const { on: onWorkspaceOpenFromFolder, emit: emitWorkspaceOpenFromFolder } =
  createTypedEvent('workspace:openFromFolder');

// ── createWorktree ──────────────────────────────────────────────────

const { on: onWorkspaceCreateWorktree, emit: emitWorkspaceCreateWorktree } =
  createTypedEvent('workspace:createWorktree');

// ── openPr ──────────────────────────────────────────────────────────

const { on: onWorkspaceOpenPr, emit: emitWorkspaceOpenPr } =
  createTypedEvent('workspace:openPr');

// ── tabWorktreeClosed ───────────────────────────────────────────────

const { on: onTabWorktreeClosed, emit: emitTabWorktreeClosed } =
  createTypedEvent('tab:worktreeClosed');

// ── fileOpen ────────────────────────────────────────────────────────

const { on: onFileOpen, emit: emitFileOpen } =
  createTypedEvent('file:open');

// ── Public API ──────────────────────────────────────────────────────

export {
  onLayoutChanged,
  emitLayoutChanged,
  onWorkspaceActivated,
  emitWorkspaceActivated,
  onWorkspaceOpenFromFolder,
  emitWorkspaceOpenFromFolder,
  onWorkspaceCreateWorktree,
  emitWorkspaceCreateWorktree,
  onWorkspaceOpenPr,
  emitWorkspaceOpenPr,
  onTabWorktreeClosed,
  emitTabWorktreeClosed,
  onFileOpen,
  emitFileOpen,
};
