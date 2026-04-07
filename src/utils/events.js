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

/**
 * Centralized event catalog — single source of truth for all bus events.
 *
 * Before adding a new event, register it here with its payload type,
 * producers, and consumers so that the implicit coupling is documented.
 *
 * @type {Record<string, EventDef>}
 */
export const EVENT_CATALOG = {
  /**
   * Fired when a terminal's working directory changes (e.g. user ran `cd`).
   * @event terminal:cwdChanged
   * @type {{ id: string, cwd: string }}
   */
  'terminal:cwdChanged': {
    description: 'Terminal working directory changed',
    payload: '{ id: string, cwd: string }',
    emitters: ['terminal-instance.js'],
    listeners: ['tab-manager.js', 'file-viewer.js'],
  },

  /**
   * Fired after a new terminal process is spawned and attached to a tab.
   * @event terminal:created
   * @type {{ id: string, cwd: string }}
   */
  'terminal:created': {
    description: 'New terminal spawned in a tab',
    payload: '{ id: string, cwd: string }',
    emitters: ['terminal-node-builder.js'],
    listeners: ['tab-manager.js', 'board-view.js'],
  },

  /**
   * Fired when a terminal is closed and its DOM node removed from the panel.
   * @event terminal:removed
   * @type {{ id: string }}
   */
  'terminal:removed': {
    description: 'Terminal closed and removed from panel',
    payload: '{ id: string }',
    emitters: ['terminal-panel.js'],
    listeners: ['tab-manager.js', 'board-view.js'],
  },

  /**
   * Fired when a terminal's underlying PTY process exits.
   * @event terminal:exited
   * @type {{ id: string }}
   */
  'terminal:exited': {
    description: 'Terminal process exited',
    payload: '{ id: string }',
    emitters: ['terminal-instance.js'],
    listeners: ['board-view.js'],
  },

  /**
   * Fired when workspace layout changes (panel resize, split, webview add/remove).
   * Carries no payload.
   * @event layout:changed
   * @type {undefined}
   */
  'layout:changed': {
    description: 'Workspace layout changed (panel resize, split, etc.)',
    payload: 'undefined',
    emitters: ['file-viewer.js', 'file-viewer-webview.js', 'terminal-panel.js', 'terminal-split-ops.js'],
    listeners: ['tab-manager.js'],
  },

  /**
   * Fired when a workspace tab is activated or re-shown (tab switch, restore).
   * Carries no payload.
   * @event workspace:activated
   * @type {undefined}
   */
  'workspace:activated': {
    description: 'Workspace tab activated or re-shown',
    payload: 'undefined',
    emitters: ['tab-lifecycle.js', 'workspace-layout.js'],
    listeners: ['file-viewer.js'],
  },

  /**
   * Fired when the user requests to open a folder as a new workspace tab
   * (e.g. from the file-tree context menu).
   * @event workspace:openFromFolder
   * @type {{ cwd: string }}
   */
  'workspace:openFromFolder': {
    description: 'User requested to open a folder as a new workspace tab',
    payload: '{ cwd: string }',
    emitters: ['file-tree-context-menu.js'],
    listeners: ['tab-manager.js'],
  },

  /**
   * Fired when the user requests to open a file in the editor
   * (click in file tree, drag-drop, or git changes view).
   * @event file:open
   * @type {{ path: string, name: string }}
   */
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
