import {
  formatCombo,
  eventToCombo,
  STORAGE_KEY,
  DEFAULT_BINDINGS,
  ACTION_HANDLERS,
  ALWAYS_ALLOWED_IDS,
  buildActionKeysMap,
  mergeBindings,
  buildBindingsList,
} from '../utils/shortcut-helpers.js';

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

  _registerActions() {
    for (const [id, handler] of Object.entries(ACTION_HANDLERS)) {
      this.actions.set(id, () => handler(this.tabManager));
    }
    this.actions.set('openSettings', () => this.onOpenSettings?.());
  }

  loadBindings() {
    let saved = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {}
    this.bindings = mergeBindings(saved, DEFAULT_BINDINGS);
  }

  _saveBindings() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(buildActionKeysMap(this.bindings))),
    );
  }

  getBindingsList() {
    return buildBindingsList(DEFAULT_BINDINGS, buildActionKeysMap(this.bindings));
  }

  updateBinding(actionId, newKeys) {
    for (const [combo, id] of this.bindings) {
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
      const actionId = this.bindings.get(eventToCombo(e));
      if (!actionId) return;
      if (this.tabManager.isActiveNoShortcut() && !ALWAYS_ALLOWED_IDS.has(actionId)) return;
      const handler = this.actions.get(actionId);
      if (!handler) return;
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
  }

  static formatCombo = formatCombo;
}
