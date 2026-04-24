/**
 * Singleton event bus instance.
 *
 * Extracted from events.js to break the circular dependency:
 *   events.js → terminal-events.js → events.js
 *   events.js → workspace-events.js → events.js
 *
 * This module has zero imports and can safely be consumed by any event module.
 *
 * @module event-bus
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
