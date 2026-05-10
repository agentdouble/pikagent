/**
 * Shared string sanitization utilities used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 */

/**
 * Sanitize a string by replacing disallowed characters with a separator and
 * optionally truncating to a maximum length.
 *
 * The two sanitization patterns previously duplicated across the codebase
 * (config names in config-helpers.js and path segments in worktree-dialog.js)
 * are both implemented via this single parametric helper.
 *
 * @param {string} name - Input string to sanitize.
 * @param {object} [opts]
 * @param {string} [opts.allowedChars='a-zA-Z0-9_\\- '] - Character class body for the regex allowlist.
 * @param {string} [opts.separator='_'] - Replacement character for disallowed sequences.
 * @param {number} [opts.maxLength=64] - Maximum length of the result (0 = no limit).
 * @param {boolean} [opts.trimSeparator=false] - When true, strips leading/trailing separator chars.
 * @returns {string}
 */
function sanitizeName(name, opts = {}) {
  const {
    allowedChars = 'a-zA-Z0-9_\\- ',
    separator = '_',
    maxLength = 64,
    trimSeparator = false,
  } = opts;
  const escapedSep = separator.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  let result = name.replace(new RegExp(`[^${allowedChars}]+`, 'g'), separator);
  if (trimSeparator) {
    result = result.replace(new RegExp(`^${escapedSep}+|${escapedSep}+$`, 'g'), '');
  }
  return maxLength > 0 ? result.substring(0, maxLength) : result;
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
  return sanitizeName(name, {
    allowedChars: 'a-zA-Z0-9._-',
    separator: '-',
    maxLength: 0,
    trimSeparator: true,
  });
}

module.exports = { sanitizeName, sanitizeSegment };
