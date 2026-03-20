import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { bus } from '../utils/events.js';
import { getTerminalTheme } from '../utils/terminal-themes.js';

export class BoardView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.cards = new Map(); // termId -> { element, term, fitAddon, unsubData, resizeObs, info, status }
    this._completedTerms = new Map(); // termId -> timestamp when completed
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

    const wrapper = document.createElement('div');
    wrapper.className = 'board-wrapper';

    // Hidden cards bar (shows minimized agents) — outside grid
    this.hiddenBarEl = document.createElement('div');
    this.hiddenBarEl.className = 'board-hidden-bar';
    wrapper.appendChild(this.hiddenBarEl);

    // Grid container for cards only
    const board = document.createElement('div');
    board.className = 'board-container';
    this.boardEl = board;

    this.emptyEl = document.createElement('div');
    this.emptyEl.className = 'board-empty';
    this.emptyEl.textContent = 'No agents running. Start Claude or Codex in a workspace terminal.';
    board.appendChild(this.emptyEl);

    wrapper.appendChild(board);
    this.container.appendChild(wrapper);
    this._hiddenTerms = new Set();
  }

  async scanAgents() {
    if (this.disposed) return;

    try {
      const agents = await window.api.pty.checkAgents();

      // Mark cards as completed when agent disappears (instead of removing)
      for (const [termId, data] of this.cards) {
        if (!agents[termId] && data.status === 'running') {
          data.status = 'completed';
          data.element.classList.remove('board-card-running');
          data.element.classList.add('board-card-completed');
          this._completedTerms.set(termId, Date.now());

          // Add a status badge in the header
          const badge = data.element.querySelector('.board-card-status');
          if (badge) {
            badge.textContent = 'Done';
            badge.classList.remove('board-status-running');
            badge.classList.add('board-status-completed');
          }
        }
      }

      // Add cards for newly detected agents
      for (const [termId, agentName] of Object.entries(agents)) {
        if (!this.cards.has(termId)) {
          const tabName = this._getTabNameForTerminal(termId);
          if (tabName) {
            this.addCard(termId, { tabName, agent: agentName });
          }
        } else {
          // Agent restarted in a terminal that was marked completed
          const data = this.cards.get(termId);
          if (data.status === 'completed') {
            data.status = 'running';
            data.element.classList.remove('board-card-completed');
            data.element.classList.add('board-card-running');
            this._completedTerms.delete(termId);
            const badge = data.element.querySelector('.board-card-status');
            if (badge) {
              badge.textContent = 'Running';
              badge.classList.remove('board-status-completed');
              badge.classList.add('board-status-running');
            }
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
      if (!tab.terminalPanel) continue;
      if (tab.terminalPanel.terminals?.has(termId)) {
        return tab.name;
      }
    }
    return null;
  }

  addCard(termId, info) {
    const card = document.createElement('div');
    card.className = 'board-card board-card-running';

    // Header with agent name and "go to workspace" button
    const header = document.createElement('div');
    header.className = 'board-card-header';

    const nameGroup = document.createElement('div');
    nameGroup.className = 'board-card-name-group';

    const name = document.createElement('span');
    name.className = 'board-card-name';
    name.textContent = `${info.agent} \u2014 ${info.tabName}`;
    nameGroup.appendChild(name);

    const statusBadge = document.createElement('span');
    statusBadge.className = 'board-card-status board-status-running';
    statusBadge.textContent = 'Running';
    nameGroup.appendChild(statusBadge);

    header.appendChild(nameGroup);

    const headerBtns = document.createElement('div');
    headerBtns.className = 'board-card-btns';

    const goBtn = document.createElement('button');
    goBtn.className = 'board-card-btn';
    goBtn.innerHTML = '&#8599;';
    goBtn.title = 'Go to workspace';
    goBtn.addEventListener('click', () => {
      for (const [tabId, tab] of this.tabManager.tabs) {
        if (!tab.terminalPanel) continue;
        if (tab.terminalPanel.terminals?.has(termId)) {
          this.tabManager.switchTo(tabId);
          break;
        }
      }
    });
    headerBtns.appendChild(goBtn);

    const hideBtn = document.createElement('button');
    hideBtn.className = 'board-card-btn';
    hideBtn.innerHTML = '&minus;';
    hideBtn.title = 'Hide';
    hideBtn.addEventListener('click', () => {
      card.classList.add('board-card-hidden');
      this._hiddenTerms = this._hiddenTerms || new Set();
      this._hiddenTerms.add(termId);
      this._updateHiddenBar();
    });
    headerBtns.appendChild(hideBtn);

    header.appendChild(headerBtns);

    card.appendChild(header);

    // Full interactive terminal connected directly to the PTY
    const termContainer = document.createElement('div');
    termContainer.className = 'board-card-terminal';
    card.appendChild(termContainer);

    const term = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 11,
      lineHeight: 1.2,
      cursorBlink: false,
      cursorStyle: 'bar',
      scrollback: 10000,
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

    // Fit the xterm to the card container but do NOT resize the PTY.
    // The workspace terminal is the master that controls PTY dimensions.
    const fitOnly = () => {
      try { fitAddon.fit(); } catch {}
    };

    // Insert before the empty placeholder
    this.boardEl.insertBefore(card, this.emptyEl);

    const resizeObs = new ResizeObserver(fitOnly);
    resizeObs.observe(termContainer);

    this.cards.set(termId, { element: card, term, fitAddon, unsubData, resizeObs, info, status: 'running' });

    // Fit after layout settles
    setTimeout(fitOnly, 100);
  }

  removeCard(termId) {
    const data = this.cards.get(termId);
    if (!data) return;
    if (data.unsubData) data.unsubData();
    if (data.resizeObs) data.resizeObs.disconnect();
    data.term.dispose();
    data.element.remove();
    this.cards.delete(termId);
    this._completedTerms.delete(termId);
    if (this._hiddenTerms) this._hiddenTerms.delete(termId);
    this._updateHiddenBar();
  }

  _updateHiddenBar() {
    if (!this.hiddenBarEl) return;
    this.hiddenBarEl.innerHTML = '';
    if (!this._hiddenTerms || this._hiddenTerms.size === 0) return;

    for (const termId of this._hiddenTerms) {
      const card = this.cards.get(termId);
      if (!card) continue;

      const chip = document.createElement('button');
      chip.className = 'board-hidden-chip';
      chip.textContent = card.info.agent + ' \u2014 ' + card.info.tabName;
      chip.title = 'Show';
      chip.addEventListener('click', () => {
        card.element.classList.remove('board-card-hidden');
        this._hiddenTerms.delete(termId);
        this._updateHiddenBar();
        // Refit after unhide
        setTimeout(() => {
          try { card.fitAddon.fit(); } catch {}
        }, 50);
      });
      this.hiddenBarEl.appendChild(chip);
    }
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
      const data = this.cards.get(id);
      if (data && data.status === 'running') {
        // Terminal exited while agent was running — mark as completed
        data.status = 'completed';
        data.element.classList.remove('board-card-running');
        data.element.classList.add('board-card-completed');
        this._completedTerms.set(id, Date.now());
        const badge = data.element.querySelector('.board-card-status');
        if (badge) {
          badge.textContent = 'Done';
          badge.classList.remove('board-status-running');
          badge.classList.add('board-status-completed');
        }
      } else {
        this.removeCard(id);
      }
      this.emptyEl.style.display = this.cards.size === 0 ? 'block' : 'none';
    };

    bus.on('terminal:created', this._onCreated);
    bus.on('terminal:removed', this._onRemoved);
    bus.on('terminal:exited', this._onExited);
  }

  focusDirection(dir) {
    const visibleCards = [...this.cards.entries()]
      .filter(([id]) => !this._hiddenTerms?.has(id));
    if (visibleCards.length === 0) return;

    // Find currently focused card
    const focusedIdx = visibleCards.findIndex(([, data]) =>
      data.element.contains(document.activeElement) || data.term.textarea === document.activeElement
    );

    let nextIdx;
    if (focusedIdx === -1) {
      nextIdx = 0;
    } else if (dir === 'left' || dir === 'up') {
      nextIdx = (focusedIdx - 1 + visibleCards.length) % visibleCards.length;
    } else {
      nextIdx = (focusedIdx + 1) % visibleCards.length;
    }

    visibleCards[nextIdx][1].term.focus();
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
