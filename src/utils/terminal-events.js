/**
 * Terminal domain events — lifecycle and state changes for terminal instances.
 *
 * Provides typed event constants and narrow subscription/emission APIs
 * so that the implicit event contracts are discoverable and traceable.
 *
 * @module terminal-events
 * @see event-bus.js (singleton bus instance)
 */

import { createTypedEvent } from './event-bus.js';

// ── Event constants ─────────────────────────────────────────────────

/**
 * Terminal-domain event name constants.
 * @readonly
 * @enum {string}
 */
const TERMINAL_EVENTS = {
  /** Terminal working directory changed (user ran `cd`). */
  CWD_CHANGED: 'terminal:cwdChanged',
  /** New terminal spawned in a tab. */
  CREATED: 'terminal:created',
  /** Terminal closed and removed from panel. */
  REMOVED: 'terminal:removed',
  /** Terminal PTY process exited on its own. */
  EXITED: 'terminal:exited',
};

// ── Typed helpers (generated via factory) ───────────────────────────

const cwdChanged = createTypedEvent(TERMINAL_EVENTS.CWD_CHANGED);
const created = createTypedEvent(TERMINAL_EVENTS.CREATED);
const removed = createTypedEvent(TERMINAL_EVENTS.REMOVED);
const exited = createTypedEvent(TERMINAL_EVENTS.EXITED);

/** @param {(data: { id: string, cwd: string }) => void} cb */
export const onTerminalCwdChanged = cwdChanged.on;
/** @param {{ id: string, cwd: string }} data */
export const emitTerminalCwdChanged = cwdChanged.emit;

/** @param {(data: { id: string, cwd: string }) => void} cb */
export const onTerminalCreated = created.on;
/** @param {{ id: string, cwd: string }} data */
export const emitTerminalCreated = created.emit;

/** @param {(data: { id: string }) => void} cb */
export const onTerminalRemoved = removed.on;
/** @param {{ id: string }} data */
export const emitTerminalRemoved = removed.emit;

/** @param {(data: { id: string }) => void} cb */
export const onTerminalExited = exited.on;
/** @param {{ id: string }} data */
export const emitTerminalExited = exited.emit;
