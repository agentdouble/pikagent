/* Pure helpers and constants for config-manager.
 * No DOM access — only data logic. */

/** Delay (ms) before auto-saving after a change. */
export const AUTO_SAVE_DELAY = 500;

/** Vertical offset (px) when positioning the config menu above its anchor. */
export const MENU_OFFSET = 4;

/** Fallback name when no config has been explicitly named. */
export const DEFAULT_CONFIG_NAME = 'Default';

/** Format a config entry label, prefixing a bullet when it matches the active config. */
export function configLabel(name, currentName) {
  return `${name === currentName ? '\u25cf ' : ''}${name}`;
}

/** Build the suggested name for duplicating a config. */
export function suggestedDuplicateName(currentName) {
  return `${currentName || DEFAULT_CONFIG_NAME} (copy)`;
}
