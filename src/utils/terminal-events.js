/**
 * Terminal domain events — lifecycle and state changes for terminal instances.
 *
 * Provides typed event constants and narrow subscription/emission APIs
 * so that the implicit event contracts are discoverable and traceable.
 *
 * @module terminal-events
 * @see event-bus.js (singleton bus instance)
 */

import { bus } from './event-bus.js';

// ── Event constants ─────────────────────────────────────────────────

/**
 * Terminal-domain event name constants.
 * @readonly
 * @enum {string}
 */
export const TERMINAL_EVENTS = {
  /** Terminal working directory changed (user ran `cd`). */
  CWD_CHANGED: 'terminal:cwdChanged',
  /** New terminal spawned in a tab. */
  CREATED: 'terminal:created',
  /** Terminal closed and removed from panel. */
  REMOVED: 'terminal:removed',
  /** Terminal PTY process exited on its own. */
  EXITED: 'terminal:exited',
};

// ── Typed subscription helpers ──────────────────────────────────────
// Each returns an unsubscribe function.

/** @param {(data: { id: string, cwd: string }) => void} cb */
export const onTerminalCwdChanged = (cb) => bus.on(TERMINAL_EVENTS.CWD_CHANGED, cb);

/** @param {(data: { id: string, cwd: string }) => void} cb */
export const onTerminalCreated = (cb) => bus.on(TERMINAL_EVENTS.CREATED, cb);

/** @param {(data: { id: string }) => void} cb */
export const onTerminalRemoved = (cb) => bus.on(TERMINAL_EVENTS.REMOVED, cb);

/** @param {(data: { id: string }) => void} cb */
export const onTerminalExited = (cb) => bus.on(TERMINAL_EVENTS.EXITED, cb);

// ── Typed emission helpers ──────────────────────────────────────────

/** @param {{ id: string, cwd: string }} data */
export const emitTerminalCwdChanged = (data) => bus.emit(TERMINAL_EVENTS.CWD_CHANGED, data);

/** @param {{ id: string, cwd: string }} data */
export const emitTerminalCreated = (data) => bus.emit(TERMINAL_EVENTS.CREATED, data);

/** @param {{ id: string }} data */
export const emitTerminalRemoved = (data) => bus.emit(TERMINAL_EVENTS.REMOVED, data);

/** @param {{ id: string }} data */
export const emitTerminalExited = (data) => bus.emit(TERMINAL_EVENTS.EXITED, data);
