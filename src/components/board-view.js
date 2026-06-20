import {
  onTerminalCreated, onTerminalRemoved, onTerminalExited,
} from '../utils/terminal-events.js';
import { _el } from '../utils/dom-api.js';
import { disposeTerminal, disposeTerminalMap } from '../utils/terminal-factory.js';
import { registerComponent } from '../utils/component-registry.js';
import { RendererPollingTimer } from '../utils/polling.js';
import { ComponentBase } from '../utils/component-base.js';
import { persistedSetting } from '../utils/persisted-setting.js';
import {
  DATA_VOLUME_THRESHOLD, POLL_INTERVAL_MS,
  STATUS_CONFIG, ALL_CARD_CLASSES,
  resolveCardStatus, findTabForTerminal, getTabNameForTerminal, computeFocusIndex,
  appendPreviewChunk, getPreviewState,
  getTerminalBufferPreviewState, sendBoardReply,
} from '../utils/board-helpers.js';
import { boardFacade } from '../facades/board-facade.js';

const SHOW_TERMINAL_SETTING = persistedSetting('pickagent-board-show-terminal-agents', '1');
const SHOW_HEADLESS_SETTING = persistedSetting('pickagent-board-show-headless-agents', '1');

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
    this.headlessCards = new Map();
    this.headlessSnapshot = { generatedAt: '', agents: [], errors: [] };
    this.showTerminalAgents = SHOW_TERMINAL_SETTING.get() !== '0';
    this.showHeadlessAgents = SHOW_HEADLESS_SETTING.get() !== '0';
    this._hiddenTerms = new Set();
  }

  render() {
    this.container.replaceChildren();

    this.summaryStatsEl = _el('div', 'board-summary-stats');
    this.terminalFilterInput = this._buildFilterToggle(
      'Terminal',
      this.showTerminalAgents,
      (checked) => this._setAgentGroupVisible('terminal', checked),
    );
    this.headlessFilterInput = this._buildFilterToggle(
      'Headless',
      this.showHeadlessAgents,
      (checked) => this._setAgentGroupVisible('headless', checked),
    );
    const summary = _el('div', 'board-summary',
      _el('div', null,
        _el('div', { className: 'board-summary-title', textContent: 'Agents' }),
      ),
      _el('div', 'board-summary-right',
        _el('div', 'board-filter-group',
          this.terminalFilterInput.wrapper,
          this.headlessFilterInput.wrapper,
        ),
        this.summaryStatsEl,
      ),
    );

    this.headlessErrorEl = _el('div', 'board-headless-errors');
    this.emptyEl = _el('div', { className: 'board-empty' });
    this.boardEl = _el('div', { className: 'board-container' }, this.headlessErrorEl, this.emptyEl);

    this.container.appendChild(
      _el('div', { className: 'board-wrapper' }, summary, this.boardEl),
    );
    this._renderSummary();
    this._updateHeadlessErrors();
    this._applyAgentGroupVisibility();
    this._updateEmptyState();
  }

  _buildFilterToggle(label, checked, onChange) {
    const input = _el('input', {
      type: 'checkbox',
      checked,
      onChange: (event) => onChange(Boolean(event.target.checked)),
    });
    const wrapper = _el('label', 'board-filter-toggle',
      input,
      _el('span', { textContent: label }),
    );
    return { input, wrapper };
  }

  _setAgentGroupVisible(group, visible) {
    if (group === 'terminal') {
      this.showTerminalAgents = visible;
      SHOW_TERMINAL_SETTING.set(visible ? '1' : '0');
    } else {
      this.showHeadlessAgents = visible;
      SHOW_HEADLESS_SETTING.set(visible ? '1' : '0');
    }
    this._applyAgentGroupVisibility();
    this._renderSummary();
    this._updateEmptyState();
  }

  _renderSummary() {
    if (!this.summaryStatsEl) return;
    const terminalCount = this.cards.size;
    const headlessCount = this.headlessCards.size;
    this.summaryStatsEl.replaceChildren(
      _el('span', {
        className: 'board-summary-pill board-summary-terminal',
        textContent: `${terminalCount} terminal`,
      }),
      _el('span', {
        className: 'board-summary-pill board-summary-headless',
        textContent: `${headlessCount} headless`,
      }),
      _el('span', {
        className: 'board-summary-pill board-summary-running',
        textContent: `${terminalCount + headlessCount} running`,
      }),
    );
  }

  _applyAgentGroupVisibility() {
    for (const [termId, data] of this.cards) {
      data.element.classList.toggle(
        'board-card-hidden',
        !this.showTerminalAgents || this._hiddenTerms.has(termId),
      );
    }
    for (const [, data] of this.headlessCards) {
      data.element.classList.toggle('board-card-hidden', !this.showHeadlessAgents);
    }
  }

  async scanAgents() {
    if (this.disposed) return;

    const [terminalResult, headlessResult] = await Promise.allSettled([
      boardFacade.ptyCheckAgents(),
      boardFacade.headlessList(),
    ]);

    if (terminalResult.status === 'fulfilled') {
      this._syncTerminalCards(terminalResult.value || {});
    } else {
      console.warn('Board: terminal agent scan failed', terminalResult.reason);
    }

    if (headlessResult.status === 'fulfilled') {
      this.headlessSnapshot = headlessResult.value || { generatedAt: '', agents: [], errors: [] };
      this._syncHeadlessCards(this.headlessSnapshot.agents || []);
    } else {
      console.warn('Board: headless agent scan failed', headlessResult.reason);
      this.headlessSnapshot = {
        generatedAt: new Date().toISOString(),
        agents: [],
        errors: [String(headlessResult.reason?.message || headlessResult.reason)],
      };
      this._syncHeadlessCards([]);
    }

    this._updateHeadlessErrors();
    this._renderSummary();
    this._applyAgentGroupVisibility();
    this._updateEmptyState();
  }

  _syncTerminalCards(agents) {
    for (const [termId] of this.cards) {
      if (!agents[termId]) this.removeCard(termId);
    }

    for (const [termId, agentName] of Object.entries(agents)) {
      if (this.cards.has(termId)) continue;
      const tabName = this._getTabNameForTerminal(termId);
      if (tabName) this.addCard(termId, { tabName, agent: agentName });
    }
  }

  _updateEmptyState() {
    const visibleCount = (this.showTerminalAgents ? this.cards.size - this._hiddenTerms.size : 0)
      + (this.showHeadlessAgents ? this.headlessCards.size : 0);
    this.emptyEl.textContent = this._emptyMessage();
    this.emptyEl.style.display = visibleCount === 0 ? 'block' : 'none';
  }

  _emptyMessage() {
    if (!this.showTerminalAgents && !this.showHeadlessAgents) return 'All agent groups are hidden.';
    if (!this.showTerminalAgents) return 'No headless agents running.';
    if (!this.showHeadlessAgents) return 'No terminal agents running. Start Claude or Codex in a workspace terminal.';
    return 'No agents running. Start Claude or Codex in a workspace terminal, or launch a headless flow.';
  }

  _syncHeadlessCards(agents) {
    const nextIds = new Set(agents.map((agent) => agent.id));
    for (const [agentId, data] of this.headlessCards) {
      if (!nextIds.has(agentId)) {
        data.element.remove();
        this.headlessCards.delete(agentId);
      }
    }

    for (const agent of agents) {
      const existing = this.headlessCards.get(agent.id);
      if (existing) this._updateHeadlessCard(existing, agent);
      else this._addHeadlessCard(agent);
    }
  }

  _updateHeadlessErrors() {
    if (!this.headlessErrorEl) return;
    const errors = this.headlessSnapshot?.errors || [];
    this.headlessErrorEl.replaceChildren(...errors.map((error) =>
      _el('div', { textContent: error }),
    ));
    this.headlessErrorEl.style.display = errors.length ? 'block' : 'none';
  }

  _addHeadlessCard(agent) {
    const card = _el('div', { className: 'board-card board-card-headless board-card-running' });
    card.tabIndex = 0;
    card.title = `${agent.agent} headless agent`;

    const header = this._buildHeadlessHeader(agent);
    const metaEl = _el('div', 'board-headless-meta');
    const previewEl = _el('pre', { className: 'board-card-preview' });
    const errorEl = _el('div', 'board-headless-kill-error');
    const body = _el('div', { className: 'board-card-body' },
      metaEl,
      previewEl,
      errorEl,
    );

    card.append(header, body);
    this.boardEl.insertBefore(card, this.emptyEl);

    const data = {
      element: card,
      agent,
      header,
      metaEl,
      previewEl,
      errorEl,
      killing: false,
      killError: '',
    };
    this.headlessCards.set(agent.id, data);
    this._updateHeadlessCard(data, agent);
  }

  _updateHeadlessCard(data, agent) {
    data.agent = agent;
    data.element.title = `${agent.agent} headless agent`;
    const nextHeader = this._buildHeadlessHeader(agent, data);
    data.header.replaceWith(nextHeader);
    data.header = nextHeader;
    data.metaEl.replaceChildren(...headlessMetaRows(agent));
    data.previewEl.textContent = formatHeadlessPreview(agent);
    data.errorEl.textContent = data.killError || '';
    data.errorEl.style.display = data.killError ? 'block' : 'none';
  }

  _buildHeadlessHeader(agent, data = null) {
    const label = buildHeadlessLabel(agent);
    const killBtn = _el('button', {
      className: 'board-card-btn board-card-btn-danger',
      disabled: Boolean(data?.killing),
      title: `Stop headless agent ${label}`,
      type: 'button',
      textContent: data?.killing ? '...' : '\u25A0',
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this._killHeadlessAgent(agent.id);
      },
    });

    return _el('div', 'board-card-header',
      _el('div', 'board-card-name-group',
        _el('span', { className: 'board-card-agent', textContent: agentNameLabel(agent.agent) }),
        _el('span', { className: 'board-card-title-inline', textContent: label }),
      ),
      _el('span', { className: 'board-source-pill board-source-headless', textContent: 'Headless' }),
      _el('div', 'board-card-btns', killBtn),
    );
  }

  async _killHeadlessAgent(agentId) {
    const data = this.headlessCards.get(agentId);
    if (!data || data.killing) return;
    data.killing = true;
    data.killError = '';
    this._updateHeadlessCard(data, data.agent);

    try {
      const result = await boardFacade.headlessKill(agentId);
      const details = [
        result.remainingPids?.length ? `PID still active: ${result.remainingPids.join(', ')}` : null,
        ...(result.errors || []),
      ].filter(Boolean);
      if (details.length) {
        data.killError = details.join(' | ');
        this._updateHeadlessCard(data, data.agent);
      }
      await this.scanAgents();
    } catch (err) {
      data.killError = err?.message || String(err);
      this._updateHeadlessCard(data, data.agent);
    } finally {
      if (this.headlessCards.has(agentId)) {
        const current = this.headlessCards.get(agentId);
        current.killing = false;
        this._updateHeadlessCard(current, current.agent);
      }
    }
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
    if (data.statusEl) {
      data.statusEl.className = cfg.badgeClass;
      data.statusEl.textContent = cfg.label;
    }
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

  _buildTerminalHeader(termId, info) {
    const statusEl = _el('span', {
      className: STATUS_CONFIG.running.badgeClass,
      textContent: STATUS_CONFIG.running.label,
    });
    const openBtn = _el('button', {
      className: 'board-card-btn',
      title: 'Open terminal',
      type: 'button',
      textContent: '\u2197',
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        this._openTerminal(termId);
      },
    });
    const stopBtn = _el('button', {
      className: 'board-card-btn board-card-btn-danger',
      title: 'Stop terminal',
      type: 'button',
      textContent: '\u25A0',
      onClick: (event) => {
        event.preventDefault();
        event.stopPropagation();
        boardFacade.ptyKill(termId);
        this.removeCard(termId);
        this._renderSummary();
        this._updateEmptyState();
      },
    });

    return {
      header: _el('div', 'board-card-header',
        _el('div', 'board-card-name-group',
          _el('span', { className: 'board-card-agent', textContent: info.agent }),
          _el('span', { className: 'board-card-title-inline', textContent: info.tabName }),
        ),
        _el('span', { className: 'board-source-pill board-source-terminal', textContent: 'Terminal' }),
        _el('div', 'board-card-btns', statusEl, openBtn, stopBtn),
      ),
      statusEl,
    };
  }

  _updateCardPreview(termId, data) {
    if (!data.previewEl) return;
    const terminal = this._getTerminalNode(termId)?.terminal?.terminal;
    const terminalState = getTerminalBufferPreviewState(terminal);
    const fallbackState = getPreviewState(data.preview);
    const previewState = terminalState.text || terminalState.transientText
      ? terminalState
      : fallbackState;

    if (previewState.text) data.lastPreviewText = previewState.text;
    data.lastTransientText = previewState.transientText || '';

    const displayLines = [];
    if (data.lastPreviewText) displayLines.push(data.lastPreviewText);
    if (data.lastTransientText) displayLines.push(data.lastTransientText);
    data.previewEl.textContent = displayLines.length > 0
      ? displayLines.join('\n\n')
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
    const { header, statusEl } = this._buildTerminalHeader(termId, info);
    card.append(header, body);

    const cardData = {
      element: card,
      header,
      term: null,
      fitAddon: null,
      unsubData: null,
      resizeObs: null,
      info,
      status: 'running',
      dataBytes: DATA_VOLUME_THRESHOLD,
      preview: { lines: [], remainder: '' },
      previewEl,
      statusEl,
      inputEl,
      lastPreviewText: '',
      lastTransientText: '',
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
    this._renderSummary();
  }

  _setupListeners() {
    const onTerminalGone = ({ id }) => { this.removeCard(id); this._updateEmptyState(); };

    // Typed subscription helpers — each returns an unsubscribe function
    this._track(onTerminalCreated(() => { if (!this.disposed) this.scanAgents(); }));
    this._track(onTerminalRemoved(onTerminalGone));
    this._track(onTerminalExited(onTerminalGone));
  }

  focusDirection(dir) {
    const visibleCards = [
      ...(this.showTerminalAgents
        ? [...this.cards.entries()].filter(([id]) => !this._hiddenTerms.has(id))
        : []),
      ...(this.showHeadlessAgents ? [...this.headlessCards.entries()] : []),
    ];
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
    for (const [, data] of this.headlessCards) data.element.remove();
    this.headlessCards.clear();
  }
}

function agentNameLabel(agent) {
  if (agent === 'codex') return 'Codex';
  if (agent === 'claude') return 'Claude';
  if (agent === 'opencode') return 'OpenCode';
  return 'Agent';
}

function buildHeadlessLabel(agent) {
  if (agent.taskId && agent.title) return `${agent.taskId} - ${agent.title}`;
  if (agent.worktreeName) return agent.worktreeName;
  if (agent.cwd) return agent.cwd.split('/').filter(Boolean).at(-1) || agent.cwd;
  return `PID ${(agent.pids || [])[0] || '-'}`;
}

function formatHeadlessPreview(agent) {
  const lines = agent.lastLogLines || [];
  return lines.length ? lines.join('\n') : 'No readable log for this headless process.';
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function headlessMetaRows(agent) {
  const rows = [
    ['PID', (agent.pids || []).join(', ')],
    ['cwd', agent.cwd],
    ['log', agent.logFile],
    ['since', agent.startedAt ? formatDateTime(agent.startedAt) : ''],
  ].filter(([, value]) => String(value || '').trim());

  return rows.map(([label, value]) =>
    _el('div', 'board-headless-meta-row',
      _el('span', { textContent: label }),
      _el('code', { textContent: value }),
    ),
  );
}

registerComponent('BoardView', BoardView);
