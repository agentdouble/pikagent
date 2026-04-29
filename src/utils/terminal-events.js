/**
 * Terminal domain events — lifecycle and state changes for terminal instances.
 *
 * Provides narrow subscription/emission APIs generated via {@link createTypedEvent}
 * so that the implicit event contracts are discoverable and traceable.
 *
 * @module terminal-events
 * @see event-bus.js (singleton bus instance)
 */

import { createTypedEvent } from './event-bus.js';

// ── cwdChanged ──────────────────────────────────────────────────────

const { on: onTerminalCwdChanged, emit: emitTerminalCwdChanged } =
  createTypedEvent('terminal:cwdChanged');

// ── created ─────────────────────────────────────────────────────────

const { on: onTerminalCreated, emit: emitTerminalCreated } =
  createTypedEvent('terminal:created');

// ── removed ─────────────────────────────────────────────────────────

const { on: onTerminalRemoved, emit: emitTerminalRemoved } =
  createTypedEvent('terminal:removed');

// ── exited ──────────────────────────────────────────────────────────

const { on: onTerminalExited, emit: emitTerminalExited } =
  createTypedEvent('terminal:exited');

// ── Public API ──────────────────────────────────────────────────────

export {
  onTerminalCwdChanged,
  emitTerminalCwdChanged,
  onTerminalCreated,
  emitTerminalCreated,
  onTerminalRemoved,
  emitTerminalRemoved,
  onTerminalExited,
  emitTerminalExited,
};
