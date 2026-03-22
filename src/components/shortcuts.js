const STORAGE_KEY = 'pickagent:keybindings';

const DEFAULT_BINDINGS = [
  { id: 'splitVertical', label: 'Split Vertical', keys: ['meta+d', 'control+d'] },
  { id: 'splitHorizontal', label: 'Split Horizontal', keys: ['shift+meta+d', 'shift+control+d'] },
  { id: 'newTab', label: 'New Tab', keys: ['meta+t', 'control+t'] },
  { id: 'closeTab', label: 'Close Tab', keys: ['meta+w', 'control+w'] },
  { id: 'openSettings', label: 'Open Settings', keys: ['meta+,', 'control+,'] },
  { id: 'focusLeft', label: 'Focus Panel Left', keys: ['control+arrowleft'] },
  { id: 'focusRight', label: 'Focus Panel Right', keys: ['control+arrowright'] },
  { id: 'focusUp', label: 'Focus Panel Up', keys: ['control+arrowup'] },
  { id: 'focusDown', label: 'Focus Panel Down', keys: ['control+arrowdown'] },
  { id: 'nextTab', label: 'Next Workspace', keys: ['control+tab'] },
  { id: 'prevTab', label: 'Previous Workspace', keys: ['shift+control+tab'] },
  { id: 'showBoard', label: 'Show Board', keys: ['meta+b', 'control+b'] },
  { id: 'showWork', label: 'Show Work', keys: ['meta+e', 'control+e'] },
  { id: 'showFlow', label: 'Show Flow', keys: ['shift+meta+f', 'shift+control+f'] },
];

// Action handlers keyed by id — each receives the tabManager instance
const ACTION_HANDLERS = {
  splitVertical: (tm) => tm.splitVertical(),
  splitHorizontal: (tm) => tm.splitHorizontal(),
  newTab: (tm) => tm.createTab(),
  closeTab: (tm) => tm.activeTabId && tm.closeTab(tm.activeTabId),
  focusLeft: (tm) => tm.focusDirection('left'),
  focusRight: (tm) => tm.focusDirection('right'),
  focusUp: (tm) => tm.focusDirection('up'),
  focusDown: (tm) => tm.focusDirection('down'),
  nextTab: (tm) => tm.nextTab(),
  prevTab: (tm) => tm.prevTab(),
  showBoard: (tm) => tm.switchToBoard(),
  showWork: (tm) => tm.setSidebarMode('work'),
  showFlow: (tm) => tm.setSidebarMode('flow'),
};

const MODIFIER_LABELS = {
  mac: { meta: '⌘', control: '⌃', shift: '⇧', alt: '⌥' },
  other: { meta: 'Win', control: 'Ctrl', shift: 'Shift', alt: 'Alt' },
};

export class ShortcutManager {
  constructor(tabManager) {
    this.tabManager = tabManager;
    this.actions = new Map();
    this.bindings = new Map(); // combo -> actionId
    this.onOpenSettings = null; // callback set from outside

    this._registerActions();
    this.loadBindings();
    this._listen();
  }

  static ALWAYS_ALLOWED = new Set([
    'nextTab', 'prevTab', 'showBoard', 'showWork', 'showFlow',
    'splitVertical', 'splitHorizontal',
  ]);

  _registerActions() {
    for (const [id, handler] of Object.entries(ACTION_HANDLERS)) {
      this.actions.set(id, () => handler(this.tabManager));
    }
    this.actions.set('openSettings', () => this.onOpenSettings?.());
  }

  loadBindings() {
    this.bindings.clear();
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

  _buildActionKeysMap() {
    const map = new Map();
    for (const [combo, actionId] of this.bindings) {
      if (!map.has(actionId)) map.set(actionId, []);
      map.get(actionId).push(combo);
    }
    return map;
  }

  _saveBindings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(this._buildActionKeysMap())));
  }

  getBindingsList() {
    const actionKeys = this._buildActionKeysMap();
    return DEFAULT_BINDINGS.map((def) => ({
      id: def.id,
      label: def.label,
      keys: actionKeys.get(def.id) || [],
      defaultKeys: def.keys,
    }));
  }

  updateBinding(actionId, newKeys) {
    for (const [combo, id] of [...this.bindings]) {
      if (id === actionId) this.bindings.delete(combo);
    }
    for (const key of newKeys) {
      this.bindings.set(key.toLowerCase(), actionId);
    }
    this._saveBindings();
  }

  resetToDefaults() {
    localStorage.removeItem(STORAGE_KEY);
    this.loadBindings();
  }

  _listen() {
    window.addEventListener('keydown', (e) => {
      const actionId = this.bindings.get(this._eventToCombo(e));
      if (!actionId) return;
      if (this.tabManager.isActiveNoShortcut() && !ShortcutManager.ALWAYS_ALLOWED.has(actionId)) return;
      const handler = this.actions.get(actionId);
      if (!handler) return;
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }

  _eventToCombo(e) {
    const parts = [];
    if (e.shiftKey) parts.push('shift');
    if (e.ctrlKey) parts.push('control');
    if (e.altKey) parts.push('alt');
    if (e.metaKey) parts.push('meta');
    parts.push(e.key.toLowerCase());
    return parts.join('+');
  }

  static formatCombo(combo) {
    const isMac = navigator.platform.includes('Mac');
    const labels = MODIFIER_LABELS[isMac ? 'mac' : 'other'];
    return combo
      .split('+')
      .map((p) => labels[p] ?? (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1)))
      .join(isMac ? '' : '+');
  }
}
