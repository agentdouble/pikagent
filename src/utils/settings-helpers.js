import { _el } from './dom.js';

/**
 * Build a button element from a descriptor.
 * @param {{ label: string, title?: string, cls?: string, onClick: Function }} desc
 * @returns {HTMLButtonElement}
 */
export function buildActionBtn({ label, title, cls, onClick }) {
  const btn = _el('button', cls, label);
  if (title) btn.title = title;
  btn.addEventListener('click', onClick);
  return btn;
}

/** Fade-out duration (ms) before removing the modal overlay. */
export const MODAL_CLOSE_TRANSITION_MS = 200;

/** Keys that are only modifiers and should not finalise a shortcut recording. */
export const MODIFIER_KEYS = ['Shift', 'Control', 'Alt', 'Meta'];

/** Settings sidebar navigation entries. */
export const NAV_SECTIONS = [
  { key: 'keybindings', label: 'Keyboard Shortcuts' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'configs', label: 'Workspace Configs' },
];

/** Day/Night mode toggle buttons. */
export const MODE_BUTTONS = [
  { mode: 'dark', label: 'Night' },
  { mode: 'light', label: 'Day' },
];

/** Bottom action buttons on the Workspace Configs section. */
export const BOTTOM_CONFIG_BUTTONS = [
  { label: 'New Config...', action: 'new' },
  { label: 'Duplicate Current...', action: 'duplicate' },
];

/** Fake terminal lines used inside theme preview cards. */
export const THEME_PREVIEW_LINES = [
  [{ text: '$ ', colorKey: 'green' }, { text: 'npm start', colorKey: 'foreground' }],
  [{ text: '> ', colorKey: 'cyan' }, { text: 'ready', colorKey: 'green' }],
];

/** Theme color keys shown as dots under the preview. */
export const COLOR_DOT_KEYS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];

/** Declarative table for config row action buttons — drives the button group via table-driven loop. */
export const CONFIG_ACTIONS = [
  { label: 'Set Default', title: 'Charger au démarrage', cls: 'config-action-btn', action: 'setDefault', hideWhen: 'isDefault' },
  { label: 'Overwrite', title: 'Écraser avec le workspace actuel', cls: 'config-action-btn', action: 'overwrite' },
  { label: '✕', title: '', cls: 'config-action-btn config-delete-btn', action: 'delete' },
];

/**
 * Format a workspace-config metadata string ("3 tabs · 28/03/2026").
 * @param {number} tabCount
 * @param {string|null} updatedAt  ISO date string or null
 * @returns {string}
 */
export function formatConfigMeta(tabCount, updatedAt) {
  const tabs = `${tabCount} tab${tabCount !== 1 ? 's' : ''}`;
  const date = updatedAt ? new Date(updatedAt).toLocaleDateString() : '';
  return `${tabs} · ${date}`;
}
