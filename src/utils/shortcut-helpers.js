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
