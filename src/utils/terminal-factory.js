import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { getTerminalTheme } from './terminal-themes.js';
import { _safeFit } from './dom.js';

export const BASE_FONT_FAMILY =
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
  if (data.unsubData) data.unsubData();
  if (data.resizeObs) data.resizeObs.disconnect();
  data.term.dispose();
}
