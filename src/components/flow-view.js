import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { getTerminalTheme } from '../utils/terminal-themes.js';
import { openFlowModal, SCHEDULE_LABELS, DAY_NAMES } from './flow-modal.js';

const TERMINAL_FONT_FAMILY = '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace';
const TERMINAL_FONT_SIZE = 12;
const TERMINAL_LINE_HEIGHT = 1.3;
const FIT_DELAY_MS = 50;
const LOG_SCROLLBACK = 50000;
const LIVE_SCROLLBACK = 10000;

const STATUS_LABELS = { success: 'Succès', error: 'Erreur' };
const NO_LOG_MESSAGE = '\r\n  Log non disponible pour ce run.\r\n';
const NO_LOG_MODAL_MESSAGE = '\r\n  Log non disponible.\r\n';
const EMPTY_LIST_MESSAGE = 'Aucun flow. Créez-en un pour automatiser vos tâches.';
const MAX_VISIBLE_RUNS = 5;

export class FlowView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.flows = [];
    this.disposed = false;
    this._liveTerminals = new Map(); // flowId -> { term, fitAddon, unsubData, resizeObs, containerEl }
    this._expandedCards = new Set(); // flowId of expanded cards
    this._runningMap = {}; // flowId -> ptyId

    this._unsubStarted = window.api.flow.onRunStarted(({ flowId, ptyId, flowName }) => {
      this._runningMap[flowId] = ptyId;
      this._expandedCards.add(flowId);
      this.refresh();
    });

    this._unsubComplete = window.api.flow.onRunComplete(({ flowId }) => {
      this._disposeLiveTerminal(flowId);
      delete this._runningMap[flowId];
      this.refresh();
    });

    this.render();
    this._initRunning();
  }

  async _initRunning() {
    this._runningMap = await window.api.flow.getRunning();
    // Auto-expand running flows
    for (const flowId of Object.keys(this._runningMap)) {
      this._expandedCards.add(flowId);
    }
    await this.refresh();
  }

  async refresh() {
    if (this.disposed) return;
    this.flows = await window.api.flow.list();
    this._renderList();
  }

  render() {
    this.container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'flow-container';

    // Header
    const header = document.createElement('div');
    header.className = 'flow-header';

    const title = document.createElement('h2');
    title.className = 'flow-title';
    title.textContent = 'Flows';
    header.appendChild(title);

    const addBtn = document.createElement('button');
    addBtn.className = 'flow-add-btn';
    addBtn.textContent = '+ Nouveau';
    addBtn.addEventListener('click', () => this._openModal());
    header.appendChild(addBtn);

    wrapper.appendChild(header);

    // List
    this.listEl = document.createElement('div');
    this.listEl.className = 'flow-list';
    wrapper.appendChild(this.listEl);

    this.container.appendChild(wrapper);
  }

  _renderList() {
    if (!this.listEl) return;

    // Dispose terminals that are no longer needed before clearing DOM
    for (const [flowId] of this._liveTerminals) {
      if (!this._runningMap[flowId]) {
        this._disposeLiveTerminal(flowId);
      }
    }
    // Dispose inline log terminals before re-render
    if (this._logTerminals) {
      for (const [flowId] of this._logTerminals) {
        this._disposeLogTerminal(flowId);
      }
    }

    this.listEl.innerHTML = '';

    if (this.flows.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'flow-empty';
      empty.textContent = EMPTY_LIST_MESSAGE;
      this.listEl.appendChild(empty);
      return;
    }

    for (const flow of this.flows) {
      this.listEl.appendChild(this._createCard(flow));
    }
  }

  _createCard(flow) {
    const isRunning = !!this._runningMap[flow.id];
    const isExpanded = this._expandedCards.has(flow.id);

    const card = document.createElement('div');
    card.className = 'flow-card';
    if (!flow.enabled) card.classList.add('flow-card-disabled');
    if (isRunning) card.classList.add('flow-card-running');
    if (isExpanded) card.classList.add('flow-card-expanded');

    const headerRow = this._createCardHeader(flow, isRunning);
    card.appendChild(headerRow);

    // Terminal area
    if (isRunning) {
      card.appendChild(this._createLiveTerminal(flow.id, this._runningMap[flow.id]));
    } else if (isExpanded) {
      const lastRun = (flow.runs || []).slice(-1)[0];
      if (lastRun) {
        const termArea = document.createElement('div');
        termArea.className = 'flow-card-terminal';
        card.appendChild(termArea);
        this._loadLogIntoContainer(flow.id, lastRun, termArea);
      }
    }

    // Click header to toggle expand/collapse
    headerRow.addEventListener('click', () => {
      if (isRunning) return;
      if (!flow.runs?.length) {
        this._openModal(flow);
        return;
      }
      if (this._expandedCards.has(flow.id)) {
        this._expandedCards.delete(flow.id);
        this._disposeLogTerminal(flow.id);
      } else {
        this._expandedCards.add(flow.id);
      }
      this._renderList();
    });

    return card;
  }

  _createCardHeader(flow, isRunning) {
    const headerRow = document.createElement('div');
    headerRow.className = 'flow-card-header';

    // Left: name + schedule + running badge
    const info = document.createElement('div');
    info.className = 'flow-card-info';

    const nameRow = document.createElement('div');
    nameRow.className = 'flow-card-name-row';

    const name = document.createElement('span');
    name.className = 'flow-card-name';
    name.textContent = flow.name;
    nameRow.appendChild(name);

    if (isRunning) {
      const badge = document.createElement('span');
      badge.className = 'flow-running-badge';
      badge.textContent = 'En cours...';
      nameRow.appendChild(badge);
    }

    info.appendChild(nameRow);

    const schedule = document.createElement('div');
    schedule.className = 'flow-card-schedule';
    schedule.textContent = this._formatSchedule(flow.schedule);
    info.appendChild(schedule);

    headerRow.appendChild(info);

    // Right: run dots + actions
    const right = document.createElement('div');
    right.className = 'flow-card-right';
    right.appendChild(this._createRunDots(flow));
    right.appendChild(this._createCardActions(flow, isRunning));
    headerRow.appendChild(right);

    return headerRow;
  }

  _createRunDots(flow) {
    const dots = document.createElement('div');
    dots.className = 'flow-card-dots';
    const runs = (flow.runs || []).slice(-MAX_VISIBLE_RUNS);
    for (const run of runs) {
      const dot = document.createElement('button');
      dot.className = `flow-dot flow-dot-${run.status}`;
      dot.title = `${run.date} — ${STATUS_LABELS[run.status] || run.status}\nCliquer pour voir le log`;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showRunLog(flow, run);
      });
      dots.appendChild(dot);
    }
    return dots;
  }

  _createCardActions(flow, isRunning) {
    const actions = document.createElement('div');
    actions.className = 'flow-card-actions';

    if (!isRunning) {
      actions.appendChild(this._createActionButton('▶', 'Exécuter maintenant', () => window.api.flow.runNow(flow.id)));
    }

    actions.appendChild(this._createActionButton(
      flow.enabled ? '⏸' : '⏵',
      flow.enabled ? 'Désactiver' : 'Activer',
      async () => { await window.api.flow.toggle(flow.id); this.refresh(); },
    ));

    actions.appendChild(this._createActionButton('✎', 'Modifier', () => this._openModal(flow)));

    actions.appendChild(this._createActionButton('✕', 'Supprimer', async () => {
      this._disposeLiveTerminal(flow.id);
      await window.api.flow.delete(flow.id);
      this.refresh();
    }, 'flow-card-btn-danger'));

    return actions;
  }

  // === Live Terminal (for running flows) ===

  _createActionButton(icon, title, onClick, extraClass = '') {
    const btn = document.createElement('button');
    btn.className = extraClass ? `flow-card-btn ${extraClass}` : 'flow-card-btn';
    btn.textContent = icon;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return btn;
  }

  _createReadonlyTerminal(containerEl, opts = {}) {
    const term = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: TERMINAL_LINE_HEIGHT,
      cursorBlink: false,
      scrollback: opts.scrollback || LIVE_SCROLLBACK,
      disableStdin: true,
      ...(opts.cursorStyle ? { cursorStyle: opts.cursorStyle } : {}),
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);

    const resizeObs = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    resizeObs.observe(containerEl);

    setTimeout(() => {
      try { fitAddon.fit(); } catch {}
    }, FIT_DELAY_MS);

    return { term, fitAddon, resizeObs };
  }

  _createLiveTerminal(flowId, ptyId) {
    // If we already have a terminal for this flow, reattach it
    const existing = this._liveTerminals.get(flowId);
    if (existing) {
      setTimeout(() => {
        try { existing.fitAddon.fit(); } catch {}
      }, FIT_DELAY_MS);
      return existing.containerEl;
    }

    const containerEl = document.createElement('div');
    containerEl.className = 'flow-card-terminal';

    const { term, fitAddon, resizeObs } = this._createReadonlyTerminal(containerEl, {
      scrollback: LIVE_SCROLLBACK,
      cursorStyle: 'bar',
    });

    // Subscribe to PTY data
    const unsubData = window.api.pty.onData(ptyId, (data) => {
      term.write(data);
    });

    this._liveTerminals.set(flowId, { term, fitAddon, unsubData, resizeObs, containerEl, ptyId });

    return containerEl;
  }

  _disposeTerminalEntry(map, flowId) {
    const data = map.get(flowId);
    if (!data) return;
    if (data.unsubData) data.unsubData();
    if (data.resizeObs) data.resizeObs.disconnect();
    data.term.dispose();
    map.delete(flowId);
  }

  _disposeLiveTerminal(flowId) {
    this._disposeTerminalEntry(this._liveTerminals, flowId);
  }

  // === Inline Log Terminal (expanded card) ===

  async _loadLogIntoContainer(flowId, run, containerEl) {
    const log = run.logTimestamp
      ? await window.api.flow.getRunLog(flowId, run.logTimestamp)
      : null;

    const { term, fitAddon, resizeObs } = this._createReadonlyTerminal(containerEl, {
      scrollback: LOG_SCROLLBACK,
    });

    term.write(log || NO_LOG_MESSAGE);

    this._logTerminals = this._logTerminals || new Map();
    this._logTerminals.set(flowId, { term, fitAddon, resizeObs });
  }

  _disposeLogTerminal(flowId) {
    if (!this._logTerminals) return;
    this._disposeTerminalEntry(this._logTerminals, flowId);
  }

  // === Past Run Log Viewer (modal) ===

  async _showRunLog(flow, run) {
    const log = await window.api.flow.getRunLog(flow.id, run.logTimestamp);

    const overlay = document.createElement('div');
    overlay.className = 'flow-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'flow-log-modal';

    // Header
    const header = document.createElement('div');
    header.className = 'flow-log-header';

    const title = document.createElement('span');
    title.className = 'flow-log-title';
    title.textContent = `${flow.name} — ${run.date}`;
    header.appendChild(title);

    const statusBadge = document.createElement('span');
    statusBadge.className = `flow-log-status flow-log-status-${run.status}`;
    statusBadge.textContent = STATUS_LABELS[run.status] || run.status;
    header.appendChild(statusBadge);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'flow-log-close';
    closeBtn.textContent = '✕';
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // Terminal to replay the log
    const termContainer = document.createElement('div');
    termContainer.className = 'flow-log-terminal';
    modal.appendChild(termContainer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const { term, resizeObs } = this._createReadonlyTerminal(termContainer, {
      scrollback: LOG_SCROLLBACK,
    });

    term.write(log || NO_LOG_MODAL_MESSAGE);

    const close = () => {
      resizeObs.disconnect();
      term.dispose();
      overlay.remove();
    };

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  _formatSchedule(schedule) {
    if (!schedule) return 'Non planifié';
    if (schedule.type === 'interval') {
      const h = schedule.intervalHours || 1;
      return `Toutes les ${h}h`;
    }
    const label = SCHEDULE_LABELS[schedule.type] || schedule.type;
    const time = schedule.time || '00:00';
    if (schedule.type === 'custom' && schedule.days) {
      const dayLabels = schedule.days.map((d) => DAY_NAMES[d]).join(', ');
      return `${dayLabels} à ${time}`;
    }
    return `${label} à ${time}`;
  }

  // ===== Creation / Edit Modal =====

  async _openModal(existing = null) {
    const flow = await openFlowModal(existing);
    if (flow) {
      await window.api.flow.save(flow);
      this.refresh();
    }
  }

  dispose() {
    this.disposed = true;
    if (this._unsubStarted) this._unsubStarted();
    if (this._unsubComplete) this._unsubComplete();
    for (const [flowId] of this._liveTerminals) {
      this._disposeLiveTerminal(flowId);
    }
    if (this._logTerminals) {
      for (const [flowId] of this._logTerminals) {
        this._disposeLogTerminal(flowId);
      }
    }
  }
}
