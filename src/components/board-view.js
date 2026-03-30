import { WebLinksAddon } from '@xterm/addon-web-links';
import { bus } from '../utils/events.js';
import { FilePathLinkProvider } from '../utils/file-link-provider.js';
import { _el, _safeFit } from '../utils/dom.js';
import { createTerminal, disposeTerminal } from '../utils/terminal-factory.js';
import {
  DATA_VOLUME_THRESHOLD, POLL_INTERVAL_MS, FIT_SETTLE_DELAY_MS, FIT_UNHIDE_DELAY_MS,
  STATUS_CONFIG, EVT_CREATED, EVT_REMOVED, EVT_EXITED,
  BOARD_TERMINAL_OPTS, HEADER_BUTTONS,
  resolveCardStatus, findTabForTerminal, getTabNameForTerminal, computeFocusIndex,
  formatCardLabel,
} from '../utils/board-helpers.js';

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
      this._setCardStatus(data, resolveCardStatus(data.dataBytes));
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
    return findTabForTerminal(this.tabManager.tabs, termId);
  }

  _getTabNameForTerminal(termId) {
    return getTabNameForTerminal(this.tabManager.tabs, termId);
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
      _el('span', { className: 'board-card-name', textContent: formatCardLabel(info.agent, info.tabName) }),
      _el('span', { className: STATUS_CONFIG.running.badgeClass, textContent: STATUS_CONFIG.running.label }),
    );

    const actionHandlers = {
      navigate: () => {
        const match = this._findTabForTerminal(termId);
        if (match) this.tabManager.switchTo(match.tabId);
      },
      hide: () => {
        card.classList.add('board-card-hidden');
        this._hiddenTerms.add(termId);
        this._updateHiddenBar();
      },
    };

    const headerBtns = _el('div', { className: 'board-card-btns' },
      ...HEADER_BUTTONS.map(btn => _el('button', {
        className: 'board-card-btn',
        textContent: btn.text,
        title: btn.title,
        onClick: actionHandlers[btn.action],
      })),
    );

    return _el('div', { className: 'board-card-header' }, nameGroup, headerBtns);
  }

  _createBoardTerminal(termContainer, termId) {
    const { term, fitAddon } = createTerminal(termContainer, BOARD_TERMINAL_OPTS);

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

  removeCard(termId) {
    const data = this.cards.get(termId);
    if (!data) return;
    disposeTerminal(data);
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
        textContent: formatCardLabel(card.info.agent, card.info.tabName),
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

    visibleCards[computeFocusIndex(focusedIdx, dir, visibleCards.length)][1].term.focus();
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
      disposeTerminal(data);
    }
    this.cards.clear();
  }
}
