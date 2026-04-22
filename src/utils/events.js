/**
 * Centralized event bus and backward-compatible re-exports.
 *
 * Domain-specific events now live in their own modules:
 * - terminal-events.js  — terminal lifecycle & state
 * - workspace-events.js — layout, workspace lifecycle, file & user actions
 *
 * This file keeps the EventBus class, the generic subscribe/unsubscribe
 * helpers, and re-exports all constants and typed helpers so that existing
 * imports from './events.js' continue to work.
 *
 * New code should import directly from the domain module instead.
 */

/** @internal */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) set.delete(callback);
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) cb(data);
    }
  }
}

export const bus = new EventBus();

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

// ── Backward-compatible re-exports from domain modules ──────────────
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
