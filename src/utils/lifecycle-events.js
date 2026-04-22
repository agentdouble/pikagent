/**
 * Terminal lifecycle events — domain-specific event module.
 *
 * Covers terminal creation, removal, exit, and cwd changes.
 * Each event exposes a typed subscription function (onXxx) and a typed
 * emit function (emitXxx) so that the event contract is explicit and
 * discoverable without reaching for the raw bus.
 *
 * @module lifecycle-events
 * @see events.js (thin re-export layer for backward compatibility)
 */

import { bus } from './events.js';

// ── Event name constants ────────────────────────────────────────────

export const LIFECYCLE_EVENTS = {
  TERMINAL_CWD_CHANGED: 'terminal:cwdChanged',
  TERMINAL_CREATED: 'terminal:created',
  TERMINAL_REMOVED: 'terminal:removed',
  TERMINAL_EXITED: 'terminal:exited',
};

// ── Typed subscription helpers ──────────────────────────────────────
// Each returns an unsubscribe function.

/** @param {(data: { id: string, cwd: string }) => void} cb */
export const onTerminalCwdChanged = (cb) => bus.on(LIFECYCLE_EVENTS.TERMINAL_CWD_CHANGED, cb);

/** @param {(data: { id: string, cwd: string }) => void} cb */
export const onTerminalCreated = (cb) => bus.on(LIFECYCLE_EVENTS.TERMINAL_CREATED, cb);

/** @param {(data: { id: string }) => void} cb */
export const onTerminalRemoved = (cb) => bus.on(LIFECYCLE_EVENTS.TERMINAL_REMOVED, cb);

/** @param {(data: { id: string }) => void} cb */
export const onTerminalExited = (cb) => bus.on(LIFECYCLE_EVENTS.TERMINAL_EXITED, cb);

// ── Typed emit helpers ──────────────────────────────────────────────

/** @param {{ id: string, cwd: string }} data */
export const emitTerminalCwdChanged = (data) => bus.emit(LIFECYCLE_EVENTS.TERMINAL_CWD_CHANGED, data);

/** @param {{ id: string, cwd: string }} data */
export const emitTerminalCreated = (data) => bus.emit(LIFECYCLE_EVENTS.TERMINAL_CREATED, data);

/** @param {{ id: string }} data */
export const emitTerminalRemoved = (data) => bus.emit(LIFECYCLE_EVENTS.TERMINAL_REMOVED, data);

/** @param {{ id: string }} data */
export const emitTerminalExited = (data) => bus.emit(LIFECYCLE_EVENTS.TERMINAL_EXITED, data);
