import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
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
    this.cards = new Map(); // termId -> { element, term, fitAddon, unsub, resizeObs }
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
      // Ask main process which terminals have agent child processes
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

      // Toggle empty state
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

    // Header
    const header = document.createElement('div');
    header.className = 'board-card-header';

    const name = document.createElement('span');
    name.className = 'board-card-name';
    name.textContent = `${info.agent} — ${info.tabName}`;
    header.appendChild(name);

    const sendBtn = document.createElement('button');
    sendBtn.className = 'board-card-send';
    sendBtn.innerHTML = '&#9654;';
    sendBtn.title = 'Send';
    header.appendChild(sendBtn);

    card.appendChild(header);

    // Terminal output area (read-only mirror)
    const termContainer = document.createElement('div');
    termContainer.className = 'board-card-terminal';
    card.appendChild(termContainer);

    // Input row
    const inputRow = document.createElement('div');
    inputRow.className = 'board-card-input-row';

    const prompt = document.createElement('span');
    prompt.className = 'board-card-prompt';
    prompt.textContent = '\u203a';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'board-card-input';
    input.placeholder = 'Send to agent...';

    inputRow.appendChild(prompt);
    inputRow.appendChild(input);
    card.appendChild(inputRow);

    // Create mini xterm (read-only mirror of the agent terminal)
    const term = new Terminal({
      theme: THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 11,
      lineHeight: 1.2,
      cursorBlink: false,
      cursorStyle: 'bar',
      scrollback: 1000,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainer);

    // Subscribe to PTY data for this terminal
    const unsub = window.api.pty.onData(({ id, data }) => {
      if (id === termId) {
        term.write(data);
      }
    });

    // Send handler
    const send = () => {
      const cmd = input.value;
      if (cmd) {
        window.api.pty.write({ id: termId, data: cmd + '\n' });
        input.value = '';
      }
    };

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
      e.stopPropagation(); // Prevent shortcuts from firing
    });

    // Insert before empty state element
    this.boardEl.insertBefore(card, this.emptyEl);

    // Observe resizes for fit
    const resizeObs = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {}
    });
    resizeObs.observe(termContainer);

    this.cards.set(termId, { element: card, term, fitAddon, unsub, resizeObs });

    // Fit after layout settles
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch {}
    }, 100);
  }

  removeCard(termId) {
    const data = this.cards.get(termId);
    if (!data) return;
    if (data.unsub) data.unsub();
    if (data.resizeObs) data.resizeObs.disconnect();
    data.term.dispose();
    data.element.remove();
    this.cards.delete(termId);
  }

  setupListeners() {
    // Refresh when terminals change
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
      if (data.unsub) data.unsub();
      if (data.resizeObs) data.resizeObs.disconnect();
      data.term.dispose();
    }
    this.cards.clear();
  }
}
