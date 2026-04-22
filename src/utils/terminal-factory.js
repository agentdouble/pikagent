import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { getTerminalTheme } from './terminal-themes.js';
import { FilePathLinkProvider } from './file-link-provider.js';
import { disposeResources } from './disposable.js';

/** Safely call fitAddon.fit(), swallowing errors from detached terminals. */
export function _safeFit(fitAddon) {
  try { fitAddon.fit(); } catch {}
}

const BASE_FONT_FAMILY =
  '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace';

/**
 * Create a Terminal + FitAddon, open into container.
 * When autoResize is true, attaches a ResizeObserver that calls _safeFit.
 * Returns { term, fitAddon, resizeObs }.
 */
export function createTerminal(container, opts = {}) {
  const { autoResize = false, fitDelay = 0, ...termOpts } = opts;

  const term = new Terminal({
    theme: getTerminalTheme(),
    fontFamily: BASE_FONT_FAMILY,
    ...termOpts,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(container);

  let resizeObs = null;
  if (autoResize) {
    resizeObs = new ResizeObserver(() => _safeFit(fitAddon));
    resizeObs.observe(container);
    if (fitDelay > 0) setTimeout(() => _safeFit(fitAddon), fitDelay);
  }

  return { term, fitAddon, resizeObs };
}

/**
 * Dispose a terminal entry: unsub data listener, disconnect observer, dispose terminal.
 */
export function disposeTerminal(data) {
  disposeResources([
    { ref: data, key: 'unsubData',  action: 'call' },
    { ref: data, key: 'resizeObs',  action: 'disconnect' },
    { ref: data, key: 'term',       action: 'dispose' },
  ]);
}

/**
 * Create a readonly terminal (disableStdin, no cursor blink, auto-resize).
 * Merges caller overrides on top of shared readonly defaults.
 */
export function createReadonlyTerminal(container, opts = {}) {
  return createTerminal(container, {
    fontSize: 12,
    lineHeight: 1.3,
    cursorBlink: false,
    disableStdin: true,
    autoResize: true,
    ...opts,
  });
}

/**
 * Dispose every terminal entry in a Map, then optionally clear it.
 * Each value must follow the { term, fitAddon, resizeObs?, unsubData? } shape.
 */
export function disposeTerminalMap(map) {
  for (const [, data] of map) disposeTerminal(data);
  map.clear();
}

/**
 * Load the WebLinksAddon and register the FilePathLinkProvider on a terminal.
 * Centralises the addon wiring shared by BoardView and TerminalInstance.
 *
 * @param {Terminal} term
 * @param {{ openExternal: (url: string) => void, getCwd: () => string|null, homedir: () => Promise<string>, openPath: (path: string) => void }} opts
 */
export function setupTerminalAddons(term, { openExternal, getCwd, homedir, openPath }) {
  term.loadAddon(new WebLinksAddon((e, url) => {
    e.preventDefault();
    openExternal(url);
  }));
  term.registerLinkProvider(new FilePathLinkProvider(term, getCwd, { homedir, openPath }));
}
