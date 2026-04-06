/**
 * Centralized event bus with documented event catalog.
 *
 * EVENT_CATALOG is the single source of truth for all bus events.
 * Adding a new event requires registering it here first.
 */

/**
 * @typedef {Object} EventDef
 * @property {string} description
 * @property {string} payload - JSDoc-style payload type description
 * @property {string[]} emitters - files that emit this event
 * @property {string[]} listeners - files that listen for this event
 */

/** @type {Record<string, EventDef>} */
export const EVENT_CATALOG = {
  'terminal:cwdChanged': {
    description: 'Terminal working directory changed',
    payload: '{ id: string, cwd: string }',
    emitters: ['terminal-instance.js'],
    listeners: ['tab-manager.js'],
  },
  'terminal:created': {
    description: 'New terminal spawned in a tab',
    payload: '{ id: string, cwd: string }',
    emitters: ['terminal-node-builder.js'],
    listeners: ['tab-manager.js'],
  },
  'terminal:removed': {
    description: 'Terminal closed and removed from panel',
    payload: '{ id: string }',
    emitters: ['terminal-panel.js'],
    listeners: ['tab-manager.js'],
  },
  'terminal:exited': {
    description: 'Terminal process exited',
    payload: '{ id: string }',
    emitters: ['terminal-instance.js'],
    listeners: ['board-view.js'],
  },
  'layout:changed': {
    description: 'Workspace layout changed (panel resize, split, etc.)',
    payload: 'undefined',
    emitters: ['file-viewer.js', 'file-viewer-webview.js', 'terminal-panel.js', 'terminal-split-ops.js'],
    listeners: ['tab-manager.js'],
  },
  'workspace:activated': {
    description: 'Workspace tab activated or re-shown',
    payload: 'undefined',
    emitters: ['tab-lifecycle.js', 'workspace-layout.js'],
    listeners: ['file-viewer.js'],
  },
  'workspace:openFromFolder': {
    description: 'User requested to open a folder as a new workspace tab',
    payload: '{ cwd: string }',
    emitters: ['file-tree-context-menu.js'],
    listeners: ['tab-manager.js'],
  },
  'file:open': {
    description: 'User requested to open a file in the editor',
    payload: '{ path: string, name: string }',
    emitters: ['file-tree-renderer.js', 'file-tree-drop.js', 'git-changes-view.js'],
    listeners: ['file-viewer.js'],
  },
};

export class EventBus {
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
