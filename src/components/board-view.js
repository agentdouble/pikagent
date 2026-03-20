import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { bus } from '../utils/events.js';

const THEME = {
  background: '#1a1a2e',
  foreground: '#e0e0e0',
  cursor: '#e0e0e0',
  cursorAccent: '#1a1a2e',
  selectionBackground: '#3a3a5e',
  black: '#1a1a2e',
  red: '#ff6b6b',
  green: '#51cf66',
  yellow: '#ffd43b',
  blue: '#74c0fc',
  magenta: '#da77f2',
  cyan: '#66d9e8',
  white: '#e0e0e0',
  brightBlack: '#555577',
  brightRed: '#ff8787',
  brightGreen: '#69db7c',
  brightYellow: '#ffe066',
  brightBlue: '#91d5ff',
  brightMagenta: '#e599f7',
  brightCyan: '#99e9f2',
  brightWhite: '#ffffff',
};

export class BoardView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.cards = new Map(); // termId -> { element, term, fitAddon, unsubData, resizeObs }
    this.disposed = false;

    this.render();
    this.setupListeners();
    this.scanAgents();

    // Poll for agent detection every 3 seconds
    this._pollTimer = setInterval(() => {
      if (!this.disposed) this.scanAgents();
    }, 3000);
  }

  render() {
    this.container.innerHTML = '';

    const board = document.createElement('div');
    board.className = 'board-container';
    this.boardEl = board;

    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'board-empty';
    this.emptyEl.textContent = 'No agents running. Start Claude or Codex in a workspace terminal.';
    board.appendChild(this.emptyEl);

    this.container.appendChild(board);
  }

  async scanAgents() {
    if (this.disposed) return;

    try {
      const agents = await window.api.pty.checkAgents();

      // Remove cards for terminals that no longer have agents
      for (const [termId] of this.cards) {
        if (!agents[termId]) {
          this.removeCard(termId);
        }
      }

      // Add cards for newly detected agents
      for (const [termId, agentName] of Object.entries(agents)) {
        if (!this.cards.has(termId)) {
          const tabName = this._getTabNameForTerminal(termId);
          if (tabName) {
            this.addCard(termId, { tabName, agent: agentName });
          }
        }
      }

      this.emptyEl.style.display = this.cards.size === 0 ? 'block' : 'none';
    } catch (e) {
      console.warn('Board: agent scan failed', e);
    }
  }

  _getTabNameForTerminal(termId) {
    for (const [, tab] of this.tabManager.tabs) {
      if (tab.isBoard) continue;
      if (tab.terminalPanel?.terminals?.has(termId)) {
        return tab.name;
      }
    }
    return null;
  }

  addCard(termId, info) {
    const card = document.createElement('div');
    card.className = 'board-card';

    // Header with agent name and "go to workspace" button
    const header = document.createElement('div');
    header.className = 'board-card-header';

    const name = document.createElement('span');
    name.className = 'board-card-name';
    name.textContent = `${info.agent} \u2014 ${info.tabName}`;
    header.appendChild(name);

    const goBtn = document.createElement('button');
    goBtn.className = 'board-card-send';
    goBtn.innerHTML = '&#8599;';
    goBtn.title = 'Go to workspace';
    goBtn.addEventListener('click', () => {
      // Switch to the workspace that owns this terminal
      for (const [tabId, tab] of this.tabManager.tabs) {
        if (tab.isBoard) continue;
        if (tab.terminalPanel?.terminals?.has(termId)) {
          this.tabManager.switchTo(tabId);
          break;
        }
      }
    });
    header.appendChild(goBtn);

    card.appendChild(header);

    // Full interactive terminal connected directly to the PTY
    const termContainer = document.createElement('div');
    termContainer.className = 'board-card-terminal';
    card.appendChild(termContainer);

    const term = new Terminal({
      theme: THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon((e, url) => {
      e.preventDefault();
      window.api.shell.openExternal(url);
    }));
    term.open(termContainer);

    // Bidirectional connection: type in board → goes to PTY
    term.onData((data) => {
      window.api.pty.write({ id: termId, data });
    });

    // PTY output → render in board terminal
    const unsubData = window.api.pty.onData(({ id, data }) => {
      if (id === termId) {
        term.write(data);
      }
    });

    // Resize the PTY when the board card terminal resizes
    const syncSize = () => {
      try {
        fitAddon.fit();
        const { cols, rows } = term;
        window.api.pty.resize({ id: termId, cols, rows });
      } catch {}
    };

    // Insert before empty state element
    this.boardEl.insertBefore(card, this.emptyEl);

    const resizeObs = new ResizeObserver(syncSize);
    resizeObs.observe(termContainer);

    this.cards.set(termId, { element: card, term, fitAddon, unsubData, resizeObs });

    // Fit after layout settles
    setTimeout(syncSize, 100);
  }

  removeCard(termId) {
    const data = this.cards.get(termId);
    if (!data) return;
    if (data.unsubData) data.unsubData();
    if (data.resizeObs) data.resizeObs.disconnect();
    data.term.dispose();
    data.element.remove();
    this.cards.delete(termId);
  }

  setupListeners() {
    this._onCreated = () => {
      if (!this.disposed) this.scanAgents();
    };
    this._onRemoved = ({ id }) => {
      this.removeCard(id);
      this.emptyEl.style.display = this.cards.size === 0 ? 'block' : 'none';
    };
    this._onExited = ({ id }) => {
      this.removeCard(id);
      this.emptyEl.style.display = this.cards.size === 0 ? 'block' : 'none';
    };

    bus.on('terminal:created', this._onCreated);
    bus.on('terminal:removed', this._onRemoved);
    bus.on('terminal:exited', this._onExited);
  }

  dispose() {
    this.disposed = true;

    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }

    bus.off('terminal:created', this._onCreated);
    bus.off('terminal:removed', this._onRemoved);
    bus.off('terminal:exited', this._onExited);

    for (const [, data] of this.cards) {
      if (data.unsubData) data.unsubData();
      if (data.resizeObs) data.resizeObs.disconnect();
      data.term.dispose();
    }
    this.cards.clear();
  }
}
