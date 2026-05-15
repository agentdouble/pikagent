/**
 * Helper to build a domain facade from a service→methods map.
 *
 * Each domain facade is a flat object of trivial delegation wrappers
 * (`alias: (...a) => service.method(...a)`). `composeFacade` removes that
 * boilerplate: it takes a list of `[service, methods]` entries and generates
 * the variadic wrappers automatically.
 *
 * `methods` accepts two forms:
 *  - an array of strings — same name on facade and service (identity), e.g.
 *    `['homedir', 'copy']` produces `{ homedir, copy }` delegating to `service.homedir` / `service.copy`.
 *  - an object `{ facadeKey: 'serviceMethod' }` — renamed wrappers, e.g.
 *    `{ gitBranch: 'branch' }` produces `gitBranch` delegating to `service.branch`.
 *
 * @param {Array<[Record<string, (...a: unknown[]) => unknown>, string[] | Record<string, string>]>} entries
 *   list of `[service, methods]` pairs
 * @returns {Record<string, (...a: unknown[]) => unknown>} the composed facade object
 */
export function composeFacade(entries) {
  /** @type {Record<string, (...a: unknown[]) => unknown>} */
  const facade = {};

  for (const [service, methods] of entries) {
    const pairs = Array.isArray(methods)
      ? methods.map((name) => /** @type {[string, string]} */ ([name, name]))
      : Object.entries(methods);

    for (const [facadeKey, serviceMethod] of pairs) {
      facade[facadeKey] = (...a) => service[serviceMethod](...a);
    }
  }

  return facade;
}
