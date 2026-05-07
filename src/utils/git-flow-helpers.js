/**
 * Shared helpers for git-related flows (open-PR, worktree, etc.).
 *
 * Deduplicates the common "call an API → check result?.ok → showErrorAlert"
 * pattern that was previously copy-pasted across flow modules.
 */

import { showErrorAlert } from './dom-dialogs.js';

/**
 * Execute a git-flow API call and surface a user-visible error alert when the
 * call fails (i.e. `result?.ok` is falsy).
 *
 * Returns the API result on success, or `null` on failure (after the alert has
 * been shown).  Callers can simply check `if (!result) return;`.
 *
 * @param {() => Promise<{ ok: boolean, error?: string }>} apiCall
 * @param {string} errorPrefix  Human-readable prefix shown before the error
 *   detail (e.g. `"Push failed: "`).
 * @returns {Promise<{ ok: boolean, error?: string } | null>}
 */
export async function gitFlowStep(apiCall, errorPrefix) {
  const result = await apiCall();
  if (!result?.ok) {
    await showErrorAlert(errorPrefix, result?.error);
    return null;
  }
  return result;
}
