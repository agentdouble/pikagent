/**
 * Shared dispose/cleanup helpers.
 *
 * Each "resource descriptor" is an object with:
 *   - `ref`    : the object (or owner) holding the resource
 *   - `key`    : the property name on `ref` (e.g. "resizeObserver")
 *   - `action` : how to clean it up — "dispose" | "disconnect" | "call" | "remove" | "clearInterval"
 *
 * After cleanup the property is set to null so it cannot be double-freed.
 *
 * `disposeResources` does NOT manage a `disposed` flag — callers that need
 * guard semantics keep their own flag (e.g. TerminalInstance).
 */

/**
 * @typedef {'dispose' | 'disconnect' | 'call' | 'remove' | 'clearInterval'} CleanupAction
 * @typedef {{ ref: object, key: string, action: CleanupAction }} ResourceDescriptor
 */

/**
 * Walk a list of resource descriptors and clean each one up.
 *
 * @param {ResourceDescriptor[]} resources
 */
export function disposeResources(resources) {
  for (const { ref, key, action } of resources) {
    const value = ref[key];
    if (value == null) continue;

    switch (action) {
      case 'dispose':
        value.dispose();
        break;
      case 'disconnect':
        value.disconnect();
        break;
      case 'call':
        value();
        break;
      case 'remove':
        value.remove();
        break;
      case 'clearInterval':
        clearInterval(value);
        break;
    }

    ref[key] = null;
  }
}
