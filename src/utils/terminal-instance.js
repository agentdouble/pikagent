import { WebLinksAddon } from '@xterm/addon-web-links';
import { generateId } from './id.js';
import { bus, EVENTS } from './events.js';
import { FilePathLinkProvider } from './file-link-provider.js';
import { createTerminal } from './terminal-factory.js';
import { CWD_POLL_MS } from './terminal-panel-helpers.js';

/**
 * Wraps a single xterm instance with PTY integration, cwd polling, and lifecycle management.
 * Self-contained — does not depend on the split-panel layout.
 */
export class TerminalInstance {
  /**
   * @param {HTMLElement} container
   * @param {string} cwd
   * @param {{ openExternal: Function, homedir: Function, openPath: Function, ptyWrite: Function, ptyOnData: Function, ptyOnExit: Function, ptyCreate: Function, ptyGetCwd: Function, ptyResize: Function, ptyKill: Function }} api - injected API methods
   */
  constructor(container, cwd, { openExternal, homedir, openPath, ptyWrite, ptyOnData, ptyOnExit, ptyCreate, ptyGetCwd, ptyResize, ptyKill }) {
    this.id = generateId('term');
    this.container = container;
    this.cwd = cwd;
    this.disposed = false;
    this._api = { ptyWrite, ptyOnData, ptyOnExit, ptyCreate, ptyGetCwd, ptyResize, ptyKill };

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

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);

    this.cwdPollingPaused = false;
    this.spawn();
    this.startCwdPolling();
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
    if (this.cwdPollTimer) {
      clearInterval(this.cwdPollTimer);
      this.cwdPollTimer = null;
    }
    this.resizeObserver.disconnect();
    if (this.unsubData) { this.unsubData(); this.unsubData = null; }
    if (this.unsubExit) { this.unsubExit(); this.unsubExit = null; }
    this._api.ptyKill({ id: this.id });
    this.terminal.dispose();
  }
}
