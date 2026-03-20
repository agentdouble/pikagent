const STORAGE_KEY = 'pickagent:keybindings';

// Default actions with their default keybindings
const DEFAULT_BINDINGS = [
  {
    id: 'splitVertical',
    label: 'Split Vertical',
    keys: ['meta+d', 'control+d'],
  },
  {
    id: 'splitHorizontal',
    label: 'Split Horizontal',
    keys: ['shift+meta+d', 'shift+control+d'],
  },
  {
    id: 'newTab',
    label: 'New Tab',
    keys: ['meta+t', 'control+t'],
  },
  {
    id: 'closeTab',
    label: 'Close Tab',
    keys: ['meta+w', 'control+w'],
  },
  {
    id: 'openSettings',
    label: 'Open Settings',
    keys: ['meta+,', 'control+,'],
  },
  {
    id: 'focusLeft',
    label: 'Focus Panel Left',
    keys: ['control+arrowleft'],
  },
  {
    id: 'focusRight',
    label: 'Focus Panel Right',
    keys: ['control+arrowright'],
  },
  {
    id: 'focusUp',
    label: 'Focus Panel Up',
    keys: ['control+arrowup'],
  },
  {
    id: 'focusDown',
    label: 'Focus Panel Down',
    keys: ['control+arrowdown'],
  },
  {
    id: 'nextTab',
    label: 'Next Workspace',
    keys: ['control+tab'],
  },
  {
    id: 'prevTab',
    label: 'Previous Workspace',
    keys: ['shift+control+tab'],
  },
  {
    id: 'showBoard',
    label: 'Show Board',
    keys: ['meta+b', 'control+b'],
  },
  {
    id: 'showWork',
    label: 'Show Work',
    keys: ['meta+e', 'control+e'],
  },
];

export class ShortcutManager {
  constructor(tabManager) {
    this.tabManager = tabManager;
    this.actions = new Map();
    this.bindings = new Map(); // combo -> actionId
    this.onOpenSettings = null; // callback set from outside

    this.registerActions();
    this.loadBindings();
    this.listen();
  }

  registerActions() {
    this.actions.set('splitHorizontal', () => this.tabManager.splitHorizontal());
    this.actions.set('splitVertical', () => this.tabManager.splitVertical());
    this.actions.set('newTab', () => this.tabManager.createTab());
    this.actions.set('closeTab', () => {
      if (this.tabManager.activeTabId) {
        this.tabManager.closeTab(this.tabManager.activeTabId);
      }
    });
    this.actions.set('openSettings', () => {
      if (this.onOpenSettings) this.onOpenSettings();
    });
    this.actions.set('focusLeft', () => this.tabManager.focusDirection('left'));
    this.actions.set('focusRight', () => this.tabManager.focusDirection('right'));
    this.actions.set('focusUp', () => this.tabManager.focusDirection('up'));
    this.actions.set('focusDown', () => this.tabManager.focusDirection('down'));
    this.actions.set('nextTab', () => this.tabManager.nextTab());
    this.actions.set('prevTab', () => this.tabManager.prevTab());
    this.actions.set('showBoard', () => this.tabManager.switchToBoard());
    this.actions.set('showWork', () => this.tabManager.setSidebarMode('work'));
  }

  loadBindings() {
    this.bindings.clear();

    // Load saved bindings or use defaults
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {}

    for (const def of DEFAULT_BINDINGS) {
      const keys = saved?.[def.id] ?? def.keys;
      for (const key of keys) {
        this.bindings.set(key.toLowerCase(), def.id);
      }
    }
  }

  saveBindings() {
    // Build a map of actionId -> keys[]
    const map = {};
    for (const [combo, actionId] of this.bindings) {
      if (!map[actionId]) map[actionId] = [];
      map[actionId].push(combo);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }

  // Returns array of { id, label, keys[] }
  getBindingsList() {
    // Rebuild from current bindings
    const actionKeys = new Map();
    for (const [combo, actionId] of this.bindings) {
      if (!actionKeys.has(actionId)) actionKeys.set(actionId, []);
      actionKeys.get(actionId).push(combo);
    }

    return DEFAULT_BINDINGS.map((def) => ({
      id: def.id,
      label: def.label,
      keys: actionKeys.get(def.id) || [],
      defaultKeys: def.keys,
    }));
  }

  updateBinding(actionId, newKeys) {
    // Remove old bindings for this action
    for (const [combo, id] of [...this.bindings]) {
      if (id === actionId) this.bindings.delete(combo);
    }
    // Set new
    for (const key of newKeys) {
      this.bindings.set(key.toLowerCase(), actionId);
    }
    this.saveBindings();
  }

  resetToDefaults() {
    localStorage.removeItem(STORAGE_KEY);
    this.loadBindings();
  }

  // Actions that still work even in NoShortcut mode
  static ALWAYS_ALLOWED = new Set(['nextTab', 'prevTab', 'showBoard', 'showWork', 'splitVertical', 'splitHorizontal']);

  listen() {
    window.addEventListener('keydown', (e) => {
      const combo = this.eventToCombo(e);
      const actionId = this.bindings.get(combo);

      if (actionId) {
        // In NoShortcut mode, only allow tab navigation
        if (this.tabManager.isActiveNoShortcut() && !ShortcutManager.ALWAYS_ALLOWED.has(actionId)) {
          return;
        }
        const handler = this.actions.get(actionId);
        if (handler) {
          e.preventDefault();
          e.stopPropagation();
          handler();
        }
      }
    });
  }

  eventToCombo(e) {
    const parts = [];
    if (e.shiftKey) parts.push('shift');
    if (e.ctrlKey) parts.push('control');
    if (e.altKey) parts.push('alt');
    if (e.metaKey) parts.push('meta');
    parts.push(e.key.toLowerCase());
    return parts.join('+');
  }

  // Human-readable label for a combo string
  static formatCombo(combo) {
    const isMac = navigator.platform.includes('Mac');
    return combo
      .split('+')
      .map((p) => {
        switch (p) {
          case 'meta': return isMac ? '⌘' : 'Win';
          case 'control': return isMac ? '⌃' : 'Ctrl';
          case 'shift': return isMac ? '⇧' : 'Shift';
          case 'alt': return isMac ? '⌥' : 'Alt';
          default: return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
        }
      })
      .join(isMac ? '' : '+');
  }
}
