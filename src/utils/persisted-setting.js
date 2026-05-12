/**
 * Tiny factories for localStorage-backed settings.
 *
 * Centralize the repeated pattern of:
 *   - reading a key with a fallback default
 *   - writing a key while swallowing access / quota errors
 *   - clearing a key the same way
 *
 * Errors from `localStorage` (e.g. SecurityError in private mode, quota
 * exceeded) are caught so callers never have to wrap the call site.
 */

/**
 * Internal helper: safe localStorage read.
 * @param {string} key
 * @returns {string | null} raw stored value or null if missing/inaccessible.
 */
function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Internal helper: safe localStorage write.
 * @param {string} key
 * @param {string} value
 */
function writeRaw(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota / access errors — setting is best-effort.
  }
}

/**
 * Internal helper: safe localStorage delete.
 * @param {string} key
 */
function removeRaw(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore access errors.
  }
}

/**
 * String-valued persisted setting.
 *
 * Values are stored as raw strings to preserve compatibility with existing
 * keys (e.g. 'pikagent-app-theme' has always held bare strings like
 * 'dark' / 'light', not JSON). Callers that need structured data should
 * use {@link persistedJsonSetting} instead.
 *
 * @param {string} key          The localStorage key to read/write.
 * @param {string} defaultValue Value returned when the key is missing or
 *                              localStorage throws.
 * @returns {{ get: () => string, set: (value: string) => void, remove: () => void }}
 */
export function persistedSetting(key, defaultValue) {
  return {
    get() {
      const raw = readRaw(key);
      return raw == null ? defaultValue : raw;
    },
    set(value) {
      writeRaw(key, value);
    },
    remove() {
      removeRaw(key);
    },
  };
}

/**
 * JSON-valued persisted setting.
 *
 * Stores any JSON-serializable value, parsing on read and stringifying on
 * write. Returns `defaultValue` when the key is missing, the stored value
 * fails to parse, or localStorage throws. The default is returned as-is
 * (not cloned), so callers should avoid mutating it if they want it to
 * remain a stable fallback.
 *
 * @template T
 * @param {string} key          The localStorage key to read/write.
 * @param {T}      defaultValue Value returned on miss / parse error.
 * @returns {{ get: () => T, set: (value: T) => void, remove: () => void }}
 */
export function persistedJsonSetting(key, defaultValue) {
  return {
    get() {
      const raw = readRaw(key);
      if (raw == null) return defaultValue;
      try {
        return JSON.parse(raw);
      } catch {
        return defaultValue;
      }
    },
    set(value) {
      writeRaw(key, JSON.stringify(value));
    },
    remove() {
      removeRaw(key);
    },
  };
}
