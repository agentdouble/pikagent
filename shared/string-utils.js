/**
 * Shared string sanitization utilities used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 */

/**
 * Generic sanitizer: replaces characters outside `allowedChars` with `replacement`,
 * then optionally post-processes the result. Centralises the
 * "replace forbidden chars, then transform" pattern shared by sanitizeName
 * and sanitizeSegment.
 *
 * @param {string} name
 * @param {{ allowedChars: string, replacement: string, plus?: boolean, postProcess?: (s: string) => string }} opts
 * @returns {string}
 */
function _sanitize(name, { allowedChars, replacement, plus = false, postProcess }) {
  const pattern = new RegExp(`[^${allowedChars}]${plus ? '+' : ''}`, 'g');
  const replaced = name.replace(pattern, replacement);
  return postProcess ? postProcess(replaced) : replaced;
}

/**
 * Sanitize a name by replacing non-alphanumeric characters (except dash,
 * underscore, and space) with underscores, then truncating to 64 characters.
 * Used for config names and similar identifiers.
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  return _sanitize(name, {
    allowedChars: 'a-zA-Z0-9_\\- ',
    replacement: '_',
    postProcess: (s) => s.substring(0, 64),
  });
}

/**
 * Sanitize a string into a filesystem-safe path segment by replacing
 * non-alphanumeric characters (except dot, underscore, dash) with hyphens
 * and trimming leading/trailing hyphens.
 * Used for branch names and worktree paths.
 * @param {string} name
 * @returns {string}
 */
function sanitizeSegment(name) {
  return _sanitize(name, {
    allowedChars: 'a-zA-Z0-9._-',
    replacement: '-',
    plus: true,
    postProcess: (s) => s.replace(/^-+|-+$/g, ''),
  });
}

module.exports = { sanitizeName, sanitizeSegment };
