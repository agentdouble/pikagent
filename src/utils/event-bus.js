/**
 * Singleton event bus instance.
 *
 * Standalone singleton bus — the single source of truth for the event bus
 * instance. Has zero imports so it can safely be consumed by any event module
 * (terminal-events.js, workspace-events.js) without circular dependencies.
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
