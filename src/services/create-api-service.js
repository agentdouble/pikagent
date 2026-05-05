/**
 * Creates a proxy that delegates method calls to window.api[domain].
 * Centralizes the window.api access pattern for all service modules.
 * @param {string} domain — the window.api namespace (e.g. 'config', 'flow')
 * @param {Record<string, string>} [aliases] — optional map of alias → IPC method
 *   e.g. { deleteConfig: 'delete' } so proxy.deleteConfig delegates to window.api[domain].delete
 */
export function createApiService(domain, aliases) {
  return new Proxy(/** @type {Record<string, (...args: unknown[]) => unknown>} */ ({}), {
    get: (target, method) => {
      if (method in target) return target[method];
      const resolved = aliases?.[method] ?? method;
      return (...args) => window.api[domain][resolved](...args);
    },
  });
}
