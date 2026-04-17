/**
 * Shared dispose/cleanup helpers.
 *
 * Each "resource descriptor" is an object with:
 *   - `ref`    : the object (or owner) holding the resource
 *   - `key`    : the property name on `ref` (e.g. "resizeObserver")
 *   - `action` : how to clean it up — one of the {@link CleanupAction} values
 *
 * After cleanup the property is set to null so it cannot be double-freed.
 *
 * For classes that need a `disposed` guard, use {@link createGuardedDispose}
 * to generate a `dispose()` method with built-in idempotency.
 */

/**
 * @typedef {'dispose' | 'disconnect' | 'call' | 'remove' | 'clearInterval' | 'clearTimeout'} CleanupAction
 * @typedef {{ ref: Record<string, unknown>, key: string, action: CleanupAction }} ResourceDescriptor
 * @typedef {{ disposed?: boolean } & Record<string, unknown>} DisposableOwner
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
      case 'clearTimeout':
        clearTimeout(value);
        break;
    }

    ref[key] = null;
  }
}

/**
 * Create a guarded dispose function for an object.
 *
 * Returns a `dispose()` closure that:
 *   1. Checks `owner.disposed` — if already true, returns immediately (idempotent).
 *   2. Sets `owner.disposed = true`.
 *   3. Calls `disposeResources` with the descriptor list returned by `buildResources(owner)`.
 *   4. Calls the optional `afterDispose` callback for any cleanup that cannot be
 *      expressed as a resource descriptor (e.g. method calls with arguments).
 *
 * @param {DisposableOwner} owner              — the object that owns the resources
 * @param {(owner: DisposableOwner) => ResourceDescriptor[]} buildResources — returns the descriptor list
 * @param {((owner: DisposableOwner) => void)|null} [afterDispose] — extra cleanup after resources are freed
 * @returns {() => void} a dispose function bound to `owner`
 */
export function createGuardedDispose(owner, buildResources, afterDispose = null) {
  return () => {
    if (owner.disposed) return;
    owner.disposed = true;
    disposeResources(buildResources(owner));
    if (afterDispose) afterDispose(owner);
  };
}
