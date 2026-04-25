import { WebLinksAddon } from '@xterm/addon-web-links';
import { generateId } from './id.js';
import { emitTerminalExited, emitTerminalCwdChanged } from './terminal-events.js';
import { FilePathLinkProvider } from './file-link-provider.js';
import { createTerminal } from './terminal-factory.js';
import { CWD_POLL_MS } from './terminal-panel-helpers.js';

/**
 * Wraps a single xterm instance with PTY integration, cwd polling, and lifecycle management.
 * Self-contained — does not depend on the split-panel layout.
 */
export class TerminalInstance {
  constructor(container, cwd) {
    this.id = generateId('term');
    this.container = container;
    this.cwd = cwd;
    this.disposed = false;

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
      window.api.shell.openExternal(url);
    }));
    this.terminal.registerLinkProvider(new FilePathLinkProvider(this.terminal, () => this.cwd));

    // Let Ctrl+Tab / Shift+Ctrl+Tab bubble up to the shortcut manager
    this.terminal.attachCustomKeyEventHandler((e) => {
      if (e.key === 'Tab' && e.ctrlKey) return false;
      return true;
    });

    this.fit();

    this.terminal.onData((data) => {
      if (!this.disposed) window.api.pty.write({ id: this.id, data });
    });

    this.unsubData = window.api.pty.onData(this.id, (data) => {
      if (!this.disposed) this.terminal.write(data);
    });

    this.unsubExit = window.api.pty.onExit(this.id, () => {
      emitTerminalExited({ id: this.id });
    });

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(container);

    this.cwdPollingPaused = false;
    this.spawn();
    this.startCwdPolling();
  }

  async spawn() {
    const { cols, rows } = this.terminal;
    await window.api.pty.create({ id: this.id, cwd: this.cwd, cols, rows });
  }

  startCwdPolling() {
    this.cwdPollTimer = setInterval(async () => {
      if (this.disposed || this.cwdPollingPaused) return;
      const cwd = await window.api.pty.getCwd({ id: this.id });
      if (cwd && cwd !== this.cwd) {
        this.cwd = cwd;
        emitTerminalCwdChanged({ id: this.id, cwd });
      }
    }, CWD_POLL_MS);
  }

  fit() {
    try {
      this.fitAddon.fit();
      const { cols, rows } = this.terminal;
      window.api.pty.resize({ id: this.id, cols, rows });
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
    window.api.pty.kill({ id: this.id });
    this.terminal.dispose();
  }
}
