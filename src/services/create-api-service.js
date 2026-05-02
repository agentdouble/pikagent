/**
 * Creates a proxy that delegates method calls to window.api[domain].
 * Centralizes the window.api access pattern for all service modules.
 * @param {string} domain — the window.api namespace (e.g. 'config', 'flow')
 */
export function createApiService(domain) {
  return new Proxy(/** @type {any} */ ({}), {
    get: (target, method) =>
      method in target
        ? target[method]
        : (...args) => window.api[domain][method](...args),
  });
}
