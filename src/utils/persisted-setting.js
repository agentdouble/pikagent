/**
 * Factory for a simple persisted setting backed by localStorage.
 *
 * @param {string} key - The localStorage key.
 * @param {*} defaultValue - Returned when the key is absent or JSON.parse fails.
 * @returns {{ get: () => *, set: (value: *) => void }}
 */
export function persistedSetting(key, defaultValue) {
  return {
    get() {
      try { return JSON.parse(localStorage.getItem(key)) ?? defaultValue; } catch { return defaultValue; }
    },
    set(value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    },
  };
}
