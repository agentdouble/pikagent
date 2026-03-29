/**
 * Pure helper functions and constants extracted from FileViewer.
 * No DOM or side-effect dependencies — safe to unit-test in isolation.
 */

// ===== Constants =====

export const SAVE_FLASH_MS = 600;
export const TAB_SIZE = 2;
export const TAB_SPACES = ' '.repeat(TAB_SIZE);
export const EMPTY_MESSAGE = 'Click a file to view its content';

/** Static mode buttons displayed in the file-viewer mode bar. */
export const STATIC_MODES = [
  { key: 'files', label: 'Files' },
  { key: 'git', label: 'Git Changes' },
];

/** Global pinned files: path → { name } */
export const pinnedFiles = new Map();

// ===== Helpers =====

/**
 * Compute cursor line, column, and total line count from raw text + offset.
 */
export function getCursorPosition(text, cursorOffset) {
  const textBefore = text.substring(0, cursorOffset);
  const line = textBefore.split('\n').length;
  const col = cursorOffset - textBefore.lastIndexOf('\n');
  const totalLines = text.split('\n').length;
  return { line, col, totalLines };
}

/**
 * Insert a tab (spaces) at the given selection range and return updated text + cursor.
 */
export function insertTab(text, start, end, tabSpaces) {
  const newText = text.substring(0, start) + tabSpaces + text.substring(end);
  const cursorPos = start + tabSpaces.length;
  return { text: newText, cursorPos };
}

/**
 * Normalise a user-entered address into a { url, label } pair.
 *  - "3000"             → http://localhost:3000
 *  - "localhost:3000"   → http://localhost:3000
 *  - "example.com/foo"  → http://example.com/foo
 *  - "https://x.io"    → https://x.io
 */
export function parseWebviewUrl(input) {
  if (/^\d+$/.test(input)) {
    return { url: `http://localhost:${input}`, label: `Localhost:${input}` };
  }
  const portMatch = input.match(/^(?:localhost:?)(\d+)$/i);
  if (portMatch) {
    return { url: `http://localhost:${portMatch[1]}`, label: `Localhost:${portMatch[1]}` };
  }
  const url = /^https?:\/\//.test(input) ? input : 'http://' + input;
  const label = input.replace(/^https?:\/\//, '');
  return { url, label };
}
