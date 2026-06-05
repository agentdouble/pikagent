import {
  onTerminalCreated, onTerminalRemoved, onTerminalExited,
} from '../utils/terminal-events.js';
import { _el, buildDomainButtonBar, renderList } from '../utils/dom-api.js';
import { disposeTerminal, disposeTerminalMap } from '../utils/terminal-factory.js';
import { registerComponent } from '../utils/component-registry.js';
import { RendererPollingTimer } from '../utils/polling.js';
import { ComponentBase } from '../utils/component-base.js';
import {
  DATA_VOLUME_THRESHOLD, POLL_INTERVAL_MS,
  REPLY_HISTORY_LIMIT, REPLY_RESPONSE_LINE_LIMIT,
  STATUS_CONFIG, ALL_CARD_CLASSES,
  HEADER_BUTTONS,
  resolveCardStatus, findTabForTerminal, getTabNameForTerminal, computeFocusIndex,
  formatCardLabel, appendPreviewChunk, getPreviewText, formatElapsed,
  getTerminalBufferPreview, sendBoardReply, cleanReplyResponseText,
} from '../utils/board-helpers.js';
import { boardFacade } from '../facades/board-facade.js';

class BoardView extends ComponentBase {
  constructor(container, tabManager) {
    super(container);
    this.tabManager = tabManager;
  }

  _bindEvents() {
    this._setupListeners();
  }

  _afterInit() {
    this._startPolling();
  }

  _initState() {
    this.cards = new Map();
    this._hiddenTerms = new Set();
  }

  render() {
    this.container.replaceChildren();

    this.summaryEl = _el('div', { className: 'board-summary' });
    this.hiddenBarEl = _el('div', { className: 'board-hidden-bar' });
    this.emptyEl = _el('div', { className: 'board-empty', textContent: 'No agents running. Start Claude or Codex in a workspace terminal.' });
    this.boardEl = _el('div', { className: 'board-container' }, this.emptyEl);

    this.container.appendChild(
      _el('div', { className: 'board-wrapper' }, this.summaryEl, this.hiddenBarEl, this.boardEl),
    );
    this._updateSummary();
  }

  async scanAgents() {
    if (this.disposed) return;

    try {
      const agents = await boardFacade.ptyCheckAgents();

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
      this._updateSummary();
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

    element.classList.remove(...ALL_CARD_CLASSES);
    element.classList.add(cfg.cardClass);

    if (badge) {
      badge.textContent = cfg.label;
      badge.className = cfg.badgeClass;
    }
    this._updateSummary();
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

  _getTerminalNode(termId) {
    return this._findTabForTerminal(termId)?.tab?.terminalPanel?.terminals?.get(termId) ?? null;
  }

  _getTerminalCwd(termId) {
    return this._getTerminalNode(termId)?.terminal?.cwd ?? null;
  }

  _openTerminal(termId) {
    const match = this._findTabForTerminal(termId);
    if (!match) return;
    this.tabManager.switchTo(match.tabId);
    setTimeout(() => {
      const node = match.tab.terminalPanel?.terminals?.get(termId);
      if (node) match.tab.terminalPanel.setActive(node);
    }, 0);
  }

  _buildCardHeader(termId, info, card) {
    const statusBadge = _el('span', { className: STATUS_CONFIG.running.badgeClass, textContent: STATUS_CONFIG.running.label });
    const activityEl = _el('span', { className: 'board-card-activity', textContent: 'now' });
    const nameGroup = _el('div', { className: 'board-card-name-group' },
      _el('span', { className: 'board-card-agent', textContent: info.agent }),
      _el('span', { className: 'board-card-title-inline', textContent: info.tabName }),
      statusBadge,
      activityEl,
    );

    const actionHandlers = {
      navigate: () => this._openTerminal(termId),
      stop: () => {
        boardFacade.ptyKill(termId);
        this.removeCard(termId);
        this._updateEmptyState();
        this._updateSummary();
      },
      hide: () => {
        card.classList.add('board-card-hidden');
        this._hiddenTerms.add(termId);
        this._updateHiddenBar();
        this._updateSummary();
      },
    };

    const headerBtns = buildDomainButtonBar('board-card-btn', 'board-card-btns', HEADER_BUTTONS, actionHandlers);

    return {
      header: _el('div', { className: 'board-card-header' }, nameGroup, headerBtns),
      statusBadge,
      activityEl,
    };
  }

  _sendReply(termId, inputEl) {
    const text = String(inputEl.value || '').trim();
    if (!sendBoardReply(termId, text, boardFacade.ptyWrite)) return;

    inputEl.value = '';
    const cardData = this.cards.get(termId);
    if (cardData) this._addReplyCard(cardData, text);
  }

  _createReplyCard(text) {
    const responseEl = _el('pre', {
      className: 'board-reply-card-response board-reply-card-response-empty',
      textContent: 'Waiting...',
    });
    const element = _el('div', { className: 'board-reply-card board-reply-card-pending' },
      _el('div', { className: 'board-reply-card-prompt', textContent: text }),
      responseEl,
    );

    return {
      element,
      responseEl,
      sentText: text,
      response: { lines: [], remainder: '' },
    };
  }

  _addReplyCard(cardData, text) {
    if (!cardData.replyHistoryEl) return;

    const replyCard = this._createReplyCard(text);
    cardData.replyCards.unshift(replyCard);
    cardData.activeReply = replyCard;
    cardData.replyHistoryEl.prepend(replyCard.element);

    while (cardData.replyCards.length > REPLY_HISTORY_LIMIT) {
      const removed = cardData.replyCards.pop();
      removed?.element?.remove();
    }
  }

  _appendReplyResponse(cardData, chunk) {
    const replyCard = cardData.activeReply;
    if (!replyCard) return;

    appendPreviewChunk(replyCard.response, chunk, REPLY_RESPONSE_LINE_LIMIT);
    const responseText = cleanReplyResponseText(getPreviewText(replyCard.response), replyCard.sentText);
    if (!responseText) return;

    replyCard.responseEl.textContent = responseText;
    replyCard.responseEl.classList.remove('board-reply-card-response-empty');
    replyCard.element.classList.remove('board-reply-card-pending');
  }

  _buildReplyForm(termId) {
    const inputEl = _el('input', {
      className: 'board-reply-input',
      type: 'text',
      placeholder: 'Reply to agent...',
    });
    const sendBtn = _el('button', {
      className: 'board-reply-send',
      type: 'button',
      textContent: 'Send',
      title: 'Send reply',
      onClick: () => this._sendReply(termId, inputEl),
    });
    inputEl.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      this._sendReply(termId, inputEl);
    });
    return { replyForm: _el('div', { className: 'board-reply-form' }, inputEl, sendBtn), inputEl };
  }

  _buildReplyPanel(termId) {
    const { replyForm, inputEl } = this._buildReplyForm(termId);
    const replyHistoryEl = _el('div', { className: 'board-reply-history' });
    return {
      replyPanel: _el('div', { className: 'board-reply-panel' }, replyForm, replyHistoryEl),
      inputEl,
      replyHistoryEl,
    };
  }

  _buildCardBody(termId, info) {
    const previewEl = _el('pre', { className: 'board-card-preview', textContent: 'No recent output' });
    const { replyPanel, inputEl, replyHistoryEl } = this._buildReplyPanel(termId);
    const body = _el('div', { className: 'board-card-body' },
      previewEl,
      replyPanel,
    );
    return { body, previewEl, inputEl, replyHistoryEl };
  }

  _refreshCardMeta(termId, data) {
    if (data.activityEl) data.activityEl.textContent = formatElapsed(Date.now() - data.lastActivityAt);
  }

  _updateCardPreview(termId, data) {
    if (!data.previewEl) return;
    const terminal = this._getTerminalNode(termId)?.terminal?.terminal;
    const previewText = getTerminalBufferPreview(terminal) || getPreviewText(data.preview);
    data.previewEl.textContent = previewText
      ? previewText
      : 'No recent output';
  }

  _queuePreviewRefresh(termId, data) {
    if (data.previewRefreshQueued) return;
    data.previewRefreshQueued = true;
    const schedule = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
    schedule(() => {
      data.previewRefreshQueued = false;
      if (this.cards.has(termId)) this._updateCardPreview(termId, data);
    });
  }

  addCard(termId, info) {
    const card = _el('div', { className: 'board-card board-card-running' });
    card.tabIndex = 0;
    card.title = 'Open terminal';

    const { header, statusBadge, activityEl } = this._buildCardHeader(termId, info, card);
    const { body, previewEl, inputEl, replyHistoryEl } = this._buildCardBody(termId, info);
    card.append(header, body);

    const cardData = {
      element: card,
      term: null,
      fitAddon: null,
      unsubData: null,
      resizeObs: null,
      info,
      status: 'running',
      dataBytes: DATA_VOLUME_THRESHOLD,
      preview: { lines: [], remainder: '' },
      previewEl,
      inputEl,
      replyHistoryEl,
      replyCards: [],
      activeReply: null,
      statusBadge,
      activityEl,
      lastActivityAt: Date.now(),
      previewRefreshQueued: false,
    };

    card.addEventListener('click', (event) => {
      if (event.target.closest('button, input, .board-reply-panel')) return;
      this._openTerminal(termId);
    });
    card.addEventListener('keydown', (event) => {
      if (event.target.closest('button, input, .board-reply-panel')) return;
      if (event.key === 'Enter') this._openTerminal(termId);
    });

    cardData.unsubData = boardFacade.ptyOnData(termId, (data) => {
      cardData.dataBytes += data.length;
      cardData.lastActivityAt = Date.now();
      appendPreviewChunk(cardData.preview, data);
      this._appendReplyResponse(cardData, data);
      this._updateCardPreview(termId, cardData);
      this._queuePreviewRefresh(termId, cardData);
    });

    this.boardEl.insertBefore(card, this.emptyEl);
    this.cards.set(termId, cardData);
    this._updateSummary();
  }

  removeCard(termId) {
    const data = this.cards.get(termId);
    if (!data) return;
    disposeTerminal(data);
    data.element.remove();
    this.cards.delete(termId);
    this._hiddenTerms.delete(termId);
    this._updateHiddenBar();
    this._updateSummary();
  }

  _updateHiddenBar() {
    if (!this.hiddenBarEl) return;
    renderList(this.hiddenBarEl, [...this._hiddenTerms], (termId) => {
      const card = this.cards.get(termId);
      if (!card) return null;
      return _el('button', {
        className: 'board-hidden-chip',
        textContent: formatCardLabel(card.info.agent, card.info.tabName),
        title: 'Show',
        onClick: () => {
          card.element.classList.remove('board-card-hidden');
          this._hiddenTerms.delete(termId);
          this._updateHiddenBar();
          this._updateSummary();
        },
      });
    });
  }

  _updateSummary() {
    if (!this.summaryEl) return;
    const visibleCards = [...this.cards.entries()].filter(([id]) => !this._hiddenTerms.has(id));
    const running = visibleCards.filter(([, card]) => card.status === 'running').length;
    const waiting = visibleCards.filter(([, card]) => card.status === 'waiting').length;
    this.summaryEl.replaceChildren(
      _el('div', { className: 'board-summary-title', textContent: 'Agent Control' }),
      _el('div', { className: 'board-summary-stats' },
        _el('span', { className: 'board-summary-pill board-summary-running', textContent: `${running} running` }),
        _el('span', { className: 'board-summary-pill board-summary-waiting', textContent: `${waiting} waiting` }),
        _el('span', { className: 'board-summary-pill', textContent: `${this._hiddenTerms.size} hidden` }),
      ),
    );
  }

  _setupListeners() {
    const onTerminalGone = ({ id }) => { this.removeCard(id); this._updateEmptyState(); };

    // Typed subscription helpers — each returns an unsubscribe function
    this._track(onTerminalCreated(() => { if (!this.disposed) this.scanAgents(); }));
    this._track(onTerminalRemoved(onTerminalGone));
    this._track(onTerminalExited(onTerminalGone));
  }

  focusDirection(dir) {
    const visibleCards = [...this.cards.entries()]
      .filter(([id]) => !this._hiddenTerms.has(id));
    if (visibleCards.length === 0) return;

    const focusedIdx = visibleCards.findIndex(([, data]) =>
      data.element.contains(document.activeElement)
    );

    visibleCards[computeFocusIndex(focusedIdx, dir, visibleCards.length)][1].element.focus();
  }

  _startPolling() {
    if (this.disposed) return;
    if (!this._pollTimer) {
      this._pollTimer = new RendererPollingTimer(POLL_INTERVAL_MS, () => {
        if (!this.disposed) {
          this.scanAgents();
          this._checkIdleCards();
          for (const [termId, data] of this.cards) {
            this._refreshCardMeta(termId, data);
            this._updateCardPreview(termId, data);
          }
        }
      });
    }
    this._pollTimer.start();
  }

  pause() {
    if (this._pollTimer) this._pollTimer.stop();
  }

  resume() {
    this._startPolling();
  }

  dispose() {
    super.dispose();
    this.pause();
    disposeTerminalMap(this.cards);
  }
}

registerComponent('BoardView', BoardView);
