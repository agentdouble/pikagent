/**
 * Component Registry — decouples tab-manager from concrete component imports.
 *
 * Each component module registers itself via `registerComponent(name, Class)`.
 * tab-manager and other orchestrators resolve components via `getComponent(name)`.
 */

const _registry = new Map();

/** Register a component class under a unique name. */
export function registerComponent(name, ComponentClass) {
  _registry.set(name, ComponentClass);
}

/** Retrieve a registered component class by name. Throws if not found. */
export function getComponent(name) {
  const cls = _registry.get(name);
  if (!cls) throw new Error(`Component "${name}" not registered`);
  return cls;
}
