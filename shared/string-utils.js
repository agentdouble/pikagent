/**
 * Shared string sanitization utilities used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 */

/**
 * Sanitize a name by replacing non-alphanumeric characters (except dash,
 * underscore, and space) with underscores, then truncating to 64 characters.
 * Used for config names and similar identifiers.
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_').substring(0, 64);
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
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = { sanitizeName, sanitizeSegment };
