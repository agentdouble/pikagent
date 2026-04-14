import { WebLinksAddon } from '@xterm/addon-web-links';
import { generateId } from './id.js';
import { bus, EVENTS } from './events.js';
import { FilePathLinkProvider } from './file-link-provider.js';
import { createTerminal } from './terminal-factory.js';
import { CWD_POLL_MS } from './terminal-panel-helpers.js';
import { disposeResources } from './disposable.js';

/**
 * Wraps a single xterm instance with PTY integration, cwd polling, and lifecycle management.
 * Self-contained — does not depend on the split-panel layout.
 */
export class TerminalInstance {
  /**
   * @param {HTMLElement} container
   * @param {string} cwd
   * @param {{ openExternal: (url: string) => void, homedir: () => Promise<string>, openPath: (path: string) => void, ptyWrite: (id: string, data: string) => void, ptyOnData: (id: string, cb: (data: string) => void) => () => void, ptyOnExit: (id: string, cb: (code: number) => void) => () => void, ptyCreate: (opts: { cols: number, rows: number, cwd: string }) => Promise<string>, ptyGetCwd: (id: string) => Promise<string>, ptyResize: (id: string, cols: number, rows: number) => void, ptyKill: (id: string) => void }} api - injected API methods
   */
  constructor(container, cwd, { openExternal, homedir, openPath, ptyWrite, ptyOnData, ptyOnExit, ptyCreate, ptyGetCwd, ptyResize, ptyKill }) {
    this.id = generateId('term');
    this.container = container;
    this.cwd = cwd;
    this.disposed = false;
    this._api = { ptyWrite, ptyOnData, ptyOnExit, ptyCreate, ptyGetCwd, ptyResize, ptyKill };

    this._initTerminal(container, { openExternal, homedir, openPath });
    this._attachPtyBridge();

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);

    this.cwdPollingPaused = false;
    this.spawn();
    this.startCwdPolling();
  }

  /**
   * Create the xterm terminal, load addons, and attach custom key handler.
   * @param {HTMLElement} container
   * @param {{ openExternal: (url: string) => void, homedir: () => Promise<string>, openPath: (path: string) => void }} linkApi
   */
  _initTerminal(container, { openExternal, homedir, openPath }) {
    const { term, fitAddon } = createTerminal(container, {
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    });
    this.terminal = term;
    this.fitAddon = fitAddon;

    this.terminal.loadAddon(new WebLinksAddon((e, url) => {
      e.preventDefault();
      openExternal(url);
    }));
    this.terminal.registerLinkProvider(new FilePathLinkProvider(this.terminal, () => this.cwd, { homedir, openPath }));

    // Let Ctrl+Tab / Shift+Ctrl+Tab bubble up to the shortcut manager
    this.terminal.attachCustomKeyEventHandler((e) => {
      if (e.key === 'Tab' && e.ctrlKey) return false;
      return true;
    });

    this.fit();
  }

  /**
   * Wire up bidirectional data flow between xterm and the PTY process.
   */
  _attachPtyBridge() {
    this.terminal.onData((data) => {
      if (!this.disposed) this._api.ptyWrite({ id: this.id, data });
    });

    this.unsubData = this._api.ptyOnData(this.id, (data) => {
      if (!this.disposed) this.terminal.write(data);
    });

    this.unsubExit = this._api.ptyOnExit(this.id, () => {
      /** @fires terminal:exited {{ id: string }} — PTY process exited */
      bus.emit(EVENTS.TERMINAL_EXITED, { id: this.id });
    });
  }

  async spawn() {
    const { cols, rows } = this.terminal;
    await this._api.ptyCreate({ id: this.id, cwd: this.cwd, cols, rows });
  }

  startCwdPolling() {
    this.cwdPollTimer = setInterval(async () => {
      if (this.disposed || this.cwdPollingPaused) return;
      const cwd = await this._api.ptyGetCwd({ id: this.id });
      if (cwd && cwd !== this.cwd) {
        this.cwd = cwd;
        /** @fires terminal:cwdChanged {{ id: string, cwd: string }} — cwd changed */
        bus.emit(EVENTS.TERMINAL_CWD_CHANGED, { id: this.id, cwd });
      }
    }, CWD_POLL_MS);
  }

  fit() {
    try {
      this.fitAddon.fit();
      const { cols, rows } = this.terminal;
      this._api.ptyResize({ id: this.id, cols, rows });
    } catch {}
  }

  focus() {
    this.terminal.focus();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    disposeResources([
      { ref: this, key: 'cwdPollTimer',    action: 'clearInterval' },
      { ref: this, key: 'resizeObserver',   action: 'disconnect' },
      { ref: this, key: 'unsubData',        action: 'call' },
      { ref: this, key: 'unsubExit',        action: 'call' },
    ]);
    this._api.ptyKill({ id: this.id });
    this.terminal.dispose();
  }
}
