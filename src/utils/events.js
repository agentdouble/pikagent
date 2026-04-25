/**
 * Backward-compatible re-exports and generic helpers.
 *
 * The EventBus class and singleton instance now live in event-bus.js
 * to break the circular dependency between this module and the domain
 * event modules (terminal-events.js, workspace-events.js).
 *
 * Domain-specific events live in their own modules:
 * - terminal-events.js  -- terminal lifecycle & state
 * - workspace-events.js -- layout, workspace lifecycle, file & user actions
 *
 * This file re-exports the bus, the generic subscribe/unsubscribe helpers,
 * and all constants and typed helpers so that existing imports from
 * './events.js' continue to work.
 *
 * New code should import directly from the domain module instead.
 */

import { bus } from './event-bus.js';
export { bus };

/**
 * Register an array of [event, handler] pairs on the bus.
 * Returns the array for later cleanup with unsubscribeBus().
 */
export function subscribeBus(listeners) {
  for (const [event, handler] of listeners) bus.on(event, handler);
  return listeners;
}

/**
 * Unregister an array of [event, handler] pairs from the bus.
 */
export function unsubscribeBus(listeners) {
  for (const [event, handler] of listeners) bus.off(event, handler);
}

// -- Backward-compatible re-exports from domain modules --
// New code should import directly from terminal-events.js or workspace-events.js.

import { TERMINAL_EVENTS } from './terminal-events.js';
import { WORKSPACE_EVENTS } from './workspace-events.js';

/**
 * Backward-compatible aggregate EVENTS constant.
 * @readonly
 * @enum {string}
 */
export const EVENTS = {
  TERMINAL_CWD_CHANGED: TERMINAL_EVENTS.CWD_CHANGED,
  TERMINAL_CREATED: TERMINAL_EVENTS.CREATED,
  TERMINAL_REMOVED: TERMINAL_EVENTS.REMOVED,
  TERMINAL_EXITED: TERMINAL_EVENTS.EXITED,
  LAYOUT_CHANGED: WORKSPACE_EVENTS.LAYOUT_CHANGED,
  WORKSPACE_ACTIVATED: WORKSPACE_EVENTS.ACTIVATED,
  WORKSPACE_OPEN_FROM_FOLDER: WORKSPACE_EVENTS.OPEN_FROM_FOLDER,
  WORKSPACE_CREATE_WORKTREE: WORKSPACE_EVENTS.CREATE_WORKTREE,
  WORKSPACE_OPEN_PR: WORKSPACE_EVENTS.OPEN_PR,
  FILE_OPEN: WORKSPACE_EVENTS.FILE_OPEN,
};

// Re-export domain modules for convenience
export { TERMINAL_EVENTS } from './terminal-events.js';
export { WORKSPACE_EVENTS } from './workspace-events.js';

// Re-export typed subscription helpers
export { onTerminalCwdChanged, onTerminalCreated, onTerminalRemoved, onTerminalExited } from './terminal-events.js';
export { onLayoutChanged, onWorkspaceActivated, onWorkspaceOpenFromFolder, onWorkspaceCreateWorktree, onWorkspaceOpenPr, onFileOpen } from './workspace-events.js';

// Re-export typed emission helpers
export { emitTerminalCwdChanged, emitTerminalCreated, emitTerminalRemoved, emitTerminalExited } from './terminal-events.js';
export { emitLayoutChanged, emitWorkspaceActivated, emitWorkspaceOpenFromFolder, emitWorkspaceCreateWorktree, emitWorkspaceOpenPr, emitFileOpen } from './workspace-events.js';
