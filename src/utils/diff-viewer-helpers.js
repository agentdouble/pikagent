/* Pure helpers and declarative configs for diff-viewer.
 * No DOM access — only data logic and constants. */

/** Navigation button definitions for hunk navigation. */
export const NAV_BUTTONS = [
  { text: '\u25B2', title: 'Previous change', direction: -1 },
  { text: '\u25BC', title: 'Next change', direction: 1 },
];

/** CSS class for word-diff highlights, keyed by cell type. */
export const WORD_DIFF_CLASS = {
  remove: 'diff-word-del',
  add: 'diff-word-add',
};

/** Capitalize first letter of a string. */
export function capitalize(str) {
  return str[0].toUpperCase() + str.slice(1);
}
