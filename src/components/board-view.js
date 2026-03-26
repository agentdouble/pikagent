import { WebLinksAddon } from '@xterm/addon-web-links';
import { bus } from '../utils/events.js';
import { FilePathLinkProvider } from '../utils/file-link-provider.js';
import { _el, _safeFit } from '../utils/dom.js';
import { createTerminal, disposeTerminal } from '../utils/terminal-factory.js';

// Minimum bytes of meaningful output per poll interval to consider agent "working".
// ANSI escape codes (cursor moves, color resets, status bar refreshes) produce
// small data bursts even when idle. Real agent output (streaming text, tool
// results) is much larger. 200 bytes/3s is well above idle noise.
const DATA_VOLUME_THRESHOLD = 200;
const POLL_INTERVAL_MS = 3000;
const FIT_SETTLE_DELAY_MS = 100;
const FIT_UNHIDE_DELAY_MS = 50;

const STATUS_CONFIG = {
  running: { label: 'Running', cardClass: 'board-card-running', badgeClass: 'board-card-status board-status-running' },
  waiting: { label: 'Waiting', cardClass: 'board-card-waiting', badgeClass: 'board-card-status board-status-waiting' },
};

const EVT_CREATED  = 'terminal:created';
const EVT_REMOVED  = 'terminal:removed';
const EVT_EXITED   = 'terminal:exited';

export class BoardView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.cards = new Map();
    this.disposed = false;
    this._hiddenTerms = new Set();

    this.render();
    this._setupListeners();
    this._startPolling();
  }

  render() {
    this.container.replaceChildren();

    this.hiddenBarEl = _el('div', { className: 'board-hidden-bar' });
    this.emptyEl = _el('div', { className: 'board-empty', textContent: 'No agents running. Start Claude or Codex in a workspace terminal.' });
    this.boardEl = _el('div', { className: 'board-container' }, this.emptyEl);

    this.container.appendChild(
      _el('div', { className: 'board-wrapper' }, this.hiddenBarEl, this.boardEl),
    );
  }

  async scanAgents() {
    if (this.disposed) return;

    try {
      const agents = await window.api.pty.checkAgents();

      for (const [termId] of this.cards) {
        if (!agents[termId]) this.removeCard(termId);
      }

      for (const [termId, agentName] of Object.entries(agents)) {
        if (!this.cards.has(termId)) {
          const tabName = this._getTabNameForTerminal(termId);
          if (tabName) this.addCard(termId, { tabName, agent: agentName });
        }
      }

      this._autoHideNoShortcut();
      this._updateEmptyState();
    } catch (e) {
      console.warn('Board: agent scan failed', e);
    }
  }

  _updateEmptyState() {
    this.emptyEl.style.display = this.cards.size === 0 ? 'block' : 'none';
  }

  _checkIdleCards() {
    for (const [, data] of this.cards) {
      const status = data.dataBytes >= DATA_VOLUME_THRESHOLD ? 'running' : 'waiting';
      this._setCardStatus(data, status);
      data.dataBytes = 0;
    }
  }

  _setCardStatus(data, status) {
    if (data.status === status) return;
    data.status = status;

    const cfg = STATUS_CONFIG[status];
    const { element } = data;
    const badge = element.querySelector('.board-card-status');

    element.classList.remove(STATUS_CONFIG.running.cardClass, STATUS_CONFIG.waiting.cardClass);
    element.classList.add(cfg.cardClass);

    if (badge) {
      badge.textContent = cfg.label;
      badge.className = cfg.badgeClass;
    }
  }

  _findTabForTerminal(termId) {
    for (const [tabId, tab] of this.tabManager.tabs) {
      if (tab.terminalPanel?.terminals?.has(termId)) return { tabId, tab };
    }
    return null;
  }

  _getTabNameForTerminal(termId) {
    return this._findTabForTerminal(termId)?.tab.name ?? null;
  }

  _autoHideNoShortcut() {
    for (const [termId, data] of this.cards) {
      const match = this._findTabForTerminal(termId);
      if (match?.tab.noShortcut && !this._hiddenTerms.has(termId)) {
        data.element.classList.add('board-card-hidden');
        this._hiddenTerms.add(termId);
      }
    }
    this._updateHiddenBar();
  }

  _buildCardHeader(termId, info, card) {
    const nameGroup = _el('div', { className: 'board-card-name-group' },
      _el('span', { className: 'board-card-name', textContent: `${info.agent} \u2014 ${info.tabName}` }),
      _el('span', { className: STATUS_CONFIG.running.badgeClass, textContent: STATUS_CONFIG.running.label }),
    );

    const headerBtns = _el('div', { className: 'board-card-btns' },
      _el('button', {
        className: 'board-card-btn', textContent: '\u2197', title: 'Go to workspace',
        onClick: () => {
          const match = this._findTabForTerminal(termId);
          if (match) this.tabManager.switchTo(match.tabId);
        },
      }),
      _el('button', {
        className: 'board-card-btn', textContent: '\u2212', title: 'Hide',
        onClick: () => {
          card.classList.add('board-card-hidden');
          this._hiddenTerms.add(termId);
          this._updateHiddenBar();
        },
      }),
    );

    return _el('div', { className: 'board-card-header' }, nameGroup, headerBtns);
  }

  _createBoardTerminal(termContainer, termId) {
    const { term, fitAddon } = createTerminal(termContainer, {
      fontSize: 11,
      lineHeight: 1.2,
      cursorBlink: false,
      cursorStyle: 'bar',
      scrollback: 10000,
      allowProposedApi: true,
    });

    term.loadAddon(new WebLinksAddon((e, url) => {
      e.preventDefault();
      window.api.shell.openExternal(url);
    }));
    term.registerLinkProvider(new FilePathLinkProvider(term, () => null));
    term.onData((data) => window.api.pty.write({ id: termId, data }));

    return { term, fitAddon };
  }

  addCard(termId, info) {
    const termContainer = _el('div', { className: 'board-card-terminal' });
    const card = _el('div', { className: 'board-card board-card-running' });

    card.appendChild(this._buildCardHeader(termId, info, card));
    card.appendChild(termContainer);

    const { term, fitAddon } = this._createBoardTerminal(termContainer, termId);
    const fitOnly = () => _safeFit(fitAddon);

    const cardData = { element: card, term, fitAddon, unsubData: null, resizeObs: null, info, status: 'running', dataBytes: DATA_VOLUME_THRESHOLD };

    cardData.unsubData = window.api.pty.onData(termId, (data) => {
      term.write(data);
      cardData.dataBytes += data.length;
    });

    this.boardEl.insertBefore(card, this.emptyEl);

    cardData.resizeObs = new ResizeObserver(fitOnly);
    cardData.resizeObs.observe(termContainer);
    this.cards.set(termId, cardData);

    setTimeout(fitOnly, FIT_SETTLE_DELAY_MS);
  }

  _disposeCard(data) {
    disposeTerminal(data);
  }

  removeCard(termId) {
    const data = this.cards.get(termId);
    if (!data) return;
    this._disposeCard(data);
    data.element.remove();
    this.cards.delete(termId);
    this._hiddenTerms.delete(termId);
    this._updateHiddenBar();
  }

  _updateHiddenBar() {
    if (!this.hiddenBarEl) return;
    this.hiddenBarEl.replaceChildren();
    if (this._hiddenTerms.size === 0) return;

    for (const termId of this._hiddenTerms) {
      const card = this.cards.get(termId);
      if (!card) continue;

      this.hiddenBarEl.appendChild(_el('button', {
        className: 'board-hidden-chip',
        textContent: `${card.info.agent} \u2014 ${card.info.tabName}`,
        title: 'Show',
        onClick: () => {
          card.element.classList.remove('board-card-hidden');
          this._hiddenTerms.delete(termId);
          this._updateHiddenBar();
          setTimeout(() => _safeFit(card.fitAddon), FIT_UNHIDE_DELAY_MS);
        },
      }));
    }
  }

  _setupListeners() {
    this._onCreated = () => {
      if (!this.disposed) this.scanAgents();
    };
    this._onTerminalGone = ({ id }) => {
      this.removeCard(id);
      this._updateEmptyState();
    };

    bus.on(EVT_CREATED, this._onCreated);
    bus.on(EVT_REMOVED, this._onTerminalGone);
    bus.on(EVT_EXITED, this._onTerminalGone);
  }

  focusDirection(dir) {
    const visibleCards = [...this.cards.entries()]
      .filter(([id]) => !this._hiddenTerms.has(id));
    if (visibleCards.length === 0) return;

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

  _startPolling() {
    if (this._pollTimer || this.disposed) return;
    this._pollTimer = setInterval(() => {
      if (!this.disposed) {
        this.scanAgents();
        this._checkIdleCards();
      }
    }, POLL_INTERVAL_MS);
    this.scanAgents();
  }

  pause() {
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  resume() {
    this._startPolling();
  }

  dispose() {
    this.disposed = true;
    this.pause();

    bus.off(EVT_CREATED, this._onCreated);
    bus.off(EVT_REMOVED, this._onTerminalGone);
    bus.off(EVT_EXITED, this._onTerminalGone);

    for (const [, data] of this.cards) {
      this._disposeCard(data);
    }
    this.cards.clear();
  }
}
