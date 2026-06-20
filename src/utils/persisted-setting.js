/**
 * Tiny factory for localStorage-backed string settings.
 *
 * Centralizes the repeated pattern of:
 *   - reading a key with a fallback default
 *   - writing a key while swallowing access / quota errors
 *
 * Values are stored as raw strings to preserve compatibility with existing
 * keys (e.g. 'pikagent-app-theme' has always held bare strings like
 * 'dark' / 'light', not JSON). Callers that need structured data should
 * serialize themselves before calling `set` and parse the result of `get`.
 *
 * Errors from `localStorage` (e.g. SecurityError in private mode, quota
 * exceeded) are caught so callers never have to wrap the call site.
 *
 * @param {string} key          The localStorage key to read/write.
 * @param {string} defaultValue Value returned when the key is missing or
 *                              localStorage throws.
 * @returns {{ get: () => string, set: (value: string) => void }}
 */
export function persistedSetting(key, defaultValue) {
  return {
    get() {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? defaultValue : raw;
      } catch {
        return defaultValue;
      }
    },
    set(value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        // ignore quota / access errors — setting is best-effort.
      }
    },
  };
}
