/**
 * Shared string sanitization utilities used by both main and renderer processes.
 * CommonJS format so main/ can require() it directly;
 * esbuild resolves it for the renderer bundle.
 */

/**
 * Sanitize a name for use as a **config identifier / display name**.
 *
 * Rules (intentionally different from {@link sanitizeSegment}):
 * - Keeps alphanumerics, dashes, underscores, and **spaces** (spaces are
 *   meaningful in user-facing config names).
 * - Replaces everything else with underscores (`_`).
 * - Truncates to 64 characters to avoid overly long filenames.
 *
 * **Why not reuse `sanitizeSegment`?**
 * Config names are displayed to the user and may contain spaces; they are
 * mapped to filenames via `sanitizeName(name) + '.json'`.  Git branch names
 * (handled by `sanitizeSegment`) forbid spaces and use hyphens as the
 * replacement character instead, following `git check-ref-format` conventions.
 *
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '_').substring(0, 64);
}

/**
 * Sanitize a string into a **filesystem-safe / git-ref-safe path segment**.
 *
 * Rules (intentionally different from {@link sanitizeName}):
 * - Keeps alphanumerics, dots, underscores, and dashes.
 * - Collapses any other characters (including spaces) into a single hyphen.
 * - Trims leading and trailing hyphens.
 *
 * **Why not reuse `sanitizeName`?**
 * Branch names and worktree directory names must not contain spaces and
 * should follow `git check-ref-format` conventions.  Using hyphens as the
 * replacement character produces idiomatic branch names (e.g.
 * `feat/my-branch`) whereas `sanitizeName` would yield underscores and
 * preserve spaces, which are invalid in refs.
 *
 * @param {string} name
 * @returns {string}
 */
function sanitizeSegment(name) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = { sanitizeName, sanitizeSegment };
