import { COLOR_GROUPS } from './tab-manager-helpers.js';

// Ordered list of modifier keys for combo string building
export const MODIFIERS = [
  { key: 'shiftKey', name: 'shift' },
  { key: 'ctrlKey', name: 'control' },
  { key: 'altKey', name: 'alt' },
  { key: 'metaKey', name: 'meta' },
];

export const IS_MAC =
  typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

export const MODIFIER_LABELS = IS_MAC
  ? { meta: '\u2318', control: '\u2303', shift: '\u21E7', alt: '\u2325' }
  : { meta: 'Win', control: 'Ctrl', shift: 'Shift', alt: 'Alt' };

export function capitalizeKey(key) {
  return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
}

export function formatCombo(combo) {
  return combo
    .split('+')
    .map((p) => MODIFIER_LABELS[p] ?? capitalizeKey(p))
    .join(IS_MAC ? '' : '+');
}

export function eventToCombo(e) {
  const parts = MODIFIERS.filter((m) => e[m.key]).map((m) => m.name);
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

// ── Shortcut data constants ──

export const STORAGE_KEY = 'pickagent:keybindings';

export const DEFAULT_BINDINGS = [
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
  // Color group shortcuts (no default keys — user binds them in settings)
  ...COLOR_GROUPS.map((cg) => ({
    id: `goToColor_${cg.id}`,
    label: `Go to ${cg.label} group`,
    keys: [],
  })),
];

// Action handlers keyed by id — each receives the tabManager instance
export const ACTION_HANDLERS = {
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
  // Color group navigation
  ...Object.fromEntries(
    COLOR_GROUPS.map((cg) => [`goToColor_${cg.id}`, (tm) => tm.goToColorGroup(cg.id)]),
  ),
};

export const ALWAYS_ALLOWED_IDS = new Set([
  'nextTab', 'prevTab', 'showBoard', 'showWork', 'showFlow',
  'splitVertical', 'splitHorizontal',
  ...COLOR_GROUPS.map((cg) => `goToColor_${cg.id}`),
]);

// ── Pure helpers ──

/** Invert bindings Map (combo→actionId) to actionId→combos[]. */
export function buildActionKeysMap(bindings) {
  const map = new Map();
  for (const [combo, actionId] of bindings) {
    if (!map.has(actionId)) map.set(actionId, []);
    map.get(actionId).push(combo);
  }
  return map;
}

/** Merge saved overrides with defaults into a combo→actionId Map. */
export function mergeBindings(saved, defaults) {
  const bindings = new Map();
  for (const def of defaults) {
    const keys = saved?.[def.id] ?? def.keys;
    for (const key of keys) {
      bindings.set(key.toLowerCase(), def.id);
    }
  }
  return bindings;
}

/** Build the list of bindings for display in settings UI. */
export function buildBindingsList(defaults, actionKeysMap) {
  return defaults.map((def) => ({
    id: def.id,
    label: def.label,
    keys: actionKeysMap.get(def.id) || [],
    defaultKeys: def.keys,
  }));
}
