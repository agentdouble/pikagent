/**
 * Build the shared xterm link handler used by both plain-text web links and
 * OSC 8 hyperlinks. Keeping one activator prevents xterm's OSC 8 fallback
 * from calling window.open() inside the Electron application.
 *
 * @param {(url: string) => void | Promise<unknown>} openExternal
 * @returns {{ activate: (event: MouseEvent, url: string) => void | Promise<unknown>, allowNonHttpProtocols: false }}
 */
export function createExternalLinkHandler(openExternal) {
  if (typeof openExternal !== 'function') {
    throw new TypeError('openExternal must be a function');
  }

  return {
    allowNonHttpProtocols: false,
    activate(event, url) {
      event?.preventDefault?.();
      return openExternal(url);
    },
  };
}
