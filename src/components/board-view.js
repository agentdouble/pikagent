import {
  onTerminalCreated, onTerminalRemoved, onTerminalExited,
} from '../utils/terminal-events.js';
import { _el } from '../utils/dom-api.js';
import { disposeTerminal, disposeTerminalMap } from '../utils/terminal-factory.js';
import { registerComponent } from '../utils/component-registry.js';
import { RendererPollingTimer } from '../utils/polling.js';
import { ComponentBase } from '../utils/component-base.js';
import {
  DATA_VOLUME_THRESHOLD, POLL_INTERVAL_MS,
  STATUS_CONFIG, ALL_CARD_CLASSES,
  resolveCardStatus, findTabForTerminal, getTabNameForTerminal, computeFocusIndex,
  appendPreviewChunk, getPreviewText,
  getTerminalBufferPreview, sendBoardReply,
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

    this.emptyEl = _el('div', { className: 'board-empty', textContent: 'No agents running. Start Claude or Codex in a workspace terminal.' });
    this.boardEl = _el('div', { className: 'board-container' }, this.emptyEl);

    this.container.appendChild(
      _el('div', { className: 'board-wrapper' }, this.boardEl),
    );
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

    element.classList.remove(...ALL_CARD_CLASSES);
    element.classList.add(cfg.cardClass);
  }

  _findTabForTerminal(termId) {
    return findTabForTerminal(this.tabManager.tabs, termId);
  }

  _getTabNameForTerminal(termId) {
    return getTabNameForTerminal(this.tabManager.tabs, termId);
  }

  _getTerminalNode(termId) {
    return this._findTabForTerminal(termId)?.tab?.terminalPanel?.terminals?.get(termId) ?? null;
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

  async _sendReply(termId, inputEl) {
    const text = String(inputEl.value || '').trim();
    if (!text) return;

    const cardData = this.cards.get(termId);
    if (cardData?.sendPending) return;

    if (cardData) cardData.sendPending = true;
    inputEl.disabled = true;

    try {
      const sent = await sendBoardReply(termId, text, boardFacade.ptyWrite);
      if (sent) inputEl.value = '';
    } catch (error) {
      console.warn('Board: reply send failed', error);
    } finally {
      inputEl.disabled = false;
      if (cardData) cardData.sendPending = false;
      inputEl.focus();
    }
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
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._sendReply(termId, inputEl);
      },
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
    return {
      replyPanel: _el('div', { className: 'board-reply-panel' }, replyForm),
      inputEl,
    };
  }

  _buildCardBody(termId) {
    const previewEl = _el('pre', { className: 'board-card-preview', textContent: 'No recent output' });
    const { replyPanel, inputEl } = this._buildReplyPanel(termId);
    const body = _el('div', { className: 'board-card-body' },
      previewEl,
      replyPanel,
    );
    return { body, previewEl, inputEl };
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
    card.title = `${info.agent} agent`;

    const { body, previewEl, inputEl } = this._buildCardBody(termId);
    card.append(body);

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
      lastActivityAt: Date.now(),
      previewRefreshQueued: false,
      sendPending: false,
    };

    card.addEventListener('keydown', (event) => {
      if (event.target.closest('button, input, .board-reply-panel')) return;
      if (event.key === 'Enter') this._openTerminal(termId);
    });

    cardData.unsubData = boardFacade.ptyOnData(termId, (data) => {
      cardData.dataBytes += data.length;
      cardData.lastActivityAt = Date.now();
      appendPreviewChunk(cardData.preview, data);
      this._updateCardPreview(termId, cardData);
      this._queuePreviewRefresh(termId, cardData);
    });

    this.boardEl.insertBefore(card, this.emptyEl);
    this.cards.set(termId, cardData);
  }

  removeCard(termId) {
    const data = this.cards.get(termId);
    if (!data) return;
    disposeTerminal(data);
    data.element.remove();
    this.cards.delete(termId);
    this._hiddenTerms.delete(termId);
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
