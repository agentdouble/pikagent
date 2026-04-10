/**
 * Centralized event bus with documented event catalog.
 *
 * EVENT_CATALOG is the single source of truth for all bus events.
 * Adding a new event requires registering it here first.
 */

/**
 * @typedef {{ description: string, payload: string, emitters: string[], consumers: string[] }} EventDef
 */

/**
 * Centralized event catalog — single source of truth for all bus events.
 *
 * Before adding a new event, register it here with its payload type,
 * producers, and consumers so that the implicit coupling is documented.
 *
 * Coupling analysis (issue #49):
 * - terminal:exited and workspace:openFromFolder are 1-emitter → 1-consumer,
 *   but the emitter/consumer are distant in the component tree, so converting
 *   to direct callbacks would add plumbing complexity without clear benefit.
 * - All other events have multiple emitters or consumers, making the bus the
 *   appropriate communication mechanism.
 *
 * @type {Record<string, EventDef>}
 */
/**
 * Typed event-name constants.
 *
 * Import these instead of using raw strings so that the coupling between
 * producers and consumers is explicit, traceable, and typo-proof.
 *
 * @readonly
 * @enum {string}
 */
export const EVENTS = {
  /** @see EVENT_CATALOG['terminal:cwdChanged'] */
  TERMINAL_CWD_CHANGED: 'terminal:cwdChanged',
  /** @see EVENT_CATALOG['terminal:created'] */
  TERMINAL_CREATED: 'terminal:created',
  /** @see EVENT_CATALOG['terminal:removed'] */
  TERMINAL_REMOVED: 'terminal:removed',
  /** @see EVENT_CATALOG['terminal:exited'] */
  TERMINAL_EXITED: 'terminal:exited',
  /** @see EVENT_CATALOG['layout:changed'] */
  LAYOUT_CHANGED: 'layout:changed',
  /** @see EVENT_CATALOG['workspace:activated'] */
  WORKSPACE_ACTIVATED: 'workspace:activated',
  /** @see EVENT_CATALOG['workspace:openFromFolder'] */
  WORKSPACE_OPEN_FROM_FOLDER: 'workspace:openFromFolder',
  /** @see EVENT_CATALOG['file:open'] */
  FILE_OPEN: 'file:open',
};

const EVENT_CATALOG = {
  // ── Terminal lifecycle events ──

  /**
   * Fired when a terminal's working directory changes (e.g. user ran `cd`).
   * The cwd-polling loop in TerminalInstance detects the change via pty.getCwd().
   * @event terminal:cwdChanged
   * @type {{ id: string, cwd: string }}
   */
  'terminal:cwdChanged': {
    description: 'Terminal working directory changed',
    payload: '{ id: string, cwd: string }',
    emitters: ['terminal-instance.js'],
    consumers: ['tab-manager.js', 'file-viewer.js'],
  },

  /**
   * Fired after a new terminal process is spawned and attached to a tab.
   * Emitted by the node-builder right after the TerminalInstance is constructed.
   * @event terminal:created
   * @type {{ id: string, cwd: string }}
   */
  'terminal:created': {
    description: 'New terminal spawned in a tab',
    payload: '{ id: string, cwd: string }',
    emitters: ['terminal-node-builder.js'],
    consumers: ['tab-manager.js', 'board-view.js'],
  },

  /**
   * Fired when a terminal is closed by the user and its DOM node removed
   * from the split-panel layout.
   * @event terminal:removed
   * @type {{ id: string }}
   */
  'terminal:removed': {
    description: 'Terminal closed and removed from panel',
    payload: '{ id: string }',
    emitters: ['terminal-panel.js'],
    consumers: ['tab-manager.js', 'board-view.js'],
  },

  /**
   * Fired when a terminal's underlying PTY process exits on its own
   * (not via user close — see terminal:removed for that).
   * @event terminal:exited
   * @type {{ id: string }}
   */
  'terminal:exited': {
    description: 'Terminal PTY process exited',
    payload: '{ id: string }',
    emitters: ['terminal-instance.js'],
    consumers: ['board-view.js'],
  },

  // ── Layout / workspace events ──

  /**
   * Fired when workspace layout changes (panel resize, terminal split/move,
   * webview add/remove). Carries no payload — consumers re-read state as needed.
   * @event layout:changed
   * @type {undefined}
   */
  'layout:changed': {
    description: 'Workspace layout changed (panel resize, split, webview)',
    payload: 'undefined',
    emitters: ['file-viewer.js', 'file-viewer-webview.js', 'terminal-panel.js', 'terminal-split.js'],
    consumers: ['tab-manager.js'],
  },

  /**
   * Fired when a workspace tab is activated or re-shown (tab switch, restore,
   * or initial render). Carries no payload — consumers check their own
   * isActive() predicate to decide whether to act.
   * @event workspace:activated
   * @type {undefined}
   */
  'workspace:activated': {
    description: 'Workspace tab activated or re-shown',
    payload: 'undefined',
    emitters: ['tab-lifecycle.js', 'workspace-layout.js'],
    consumers: ['file-viewer.js'],
  },

  // ── User-action events ──

  /**
   * Fired when the user requests to open a folder as a new workspace tab
   * (e.g. from the file-tree directory context menu "Open as Workspace").
   * @event workspace:openFromFolder
   * @type {{ cwd: string }}
   */
  'workspace:openFromFolder': {
    description: 'User requested to open a folder as a new workspace tab',
    payload: '{ cwd: string }',
    emitters: ['file-tree-context-menu.js'],
    consumers: ['tab-manager.js'],
  },

  /**
   * Fired when the user requests to open a file in the editor
   * (click in file tree, drag-drop, new file creation, or git changes view).
   * @event file:open
   * @type {{ path: string, name: string }}
   */
  'file:open': {
    description: 'User requested to open a file in the editor',
    payload: '{ path: string, name: string }',
    emitters: ['file-tree-renderer.js', 'file-tree-drop.js', 'git-changes-view.js'],
    consumers: ['file-viewer.js'],
  },
};

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
 * Type-checked emit — validates event name exists in catalog (dev-time only).
 * Prefer this over raw bus.emit() so that unknown events are caught early.
 *
 * @param {keyof typeof EVENT_CATALOG} event - must be a key in EVENT_CATALOG
 * @param {unknown} data - payload matching the catalog's documented shape
 */
export function emitEvent(event, data) {
  if (process.env.NODE_ENV !== 'production' && !EVENT_CATALOG[event]) {
    console.warn(`[EventBus] Unknown event: "${event}" — register it in EVENT_CATALOG (src/utils/events.js)`);
  }
  bus.emit(event, data);
}

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
