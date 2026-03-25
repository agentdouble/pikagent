import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { getTerminalTheme } from '../utils/terminal-themes.js';
import { openFlowModal, SCHEDULE_LABELS, DAY_NAMES } from './flow-modal.js';
import { _safeFit } from '../utils/dom.js';

const FIT_DELAY_MS = 50;
const LOG_SCROLLBACK = 50000;
const LIVE_SCROLLBACK = 10000;

const READONLY_TERMINAL_OPTIONS = {
  fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
  fontSize: 12,
  lineHeight: 1.3,
  cursorBlink: false,
  disableStdin: true,
};

const STATUS_LABELS = { success: 'Succès', error: 'Erreur' };
const NO_LOG_MESSAGE = '\r\n  Log non disponible pour ce run.\r\n';
const NO_LOG_MODAL_MESSAGE = '\r\n  Log non disponible.\r\n';
const EMPTY_LIST_MESSAGE = 'Aucun flow. Créez-en un pour automatiser vos tâches.';
const MAX_VISIBLE_RUNS = 5;

// --- DOM helpers ---

function _el(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

export class FlowView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.flows = [];
    this.disposed = false;
    this._liveTerminals = new Map(); // flowId -> { term, fitAddon, unsubData, resizeObs, containerEl }
    this._logTerminals = new Map();  // flowId -> { term, fitAddon, resizeObs }
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

  _disposeAllFromMap(map) {
    for (const [flowId] of map) {
      this._disposeTerminalEntry(map, flowId);
    }
  }

  render() {
    this.container.replaceChildren();

    const wrapper = _el('div', 'flow-container');

    const header = _el('div', 'flow-header');
    header.appendChild(_el('h2', 'flow-title', 'Flows'));

    const addBtn = _el('button', 'flow-add-btn', '+ Nouveau');
    addBtn.addEventListener('click', () => this._openModal());
    header.appendChild(addBtn);

    wrapper.appendChild(header);

    this.listEl = _el('div', 'flow-list');
    wrapper.appendChild(this.listEl);

    this.container.appendChild(wrapper);
  }

  _renderList() {
    if (!this.listEl) return;

    // Dispose terminals that are no longer needed before clearing DOM
    for (const [flowId] of this._liveTerminals) {
      if (!this._runningMap[flowId]) this._disposeLiveTerminal(flowId);
    }
    this._disposeAllFromMap(this._logTerminals);

    this.listEl.replaceChildren();

    if (this.flows.length === 0) {
      this.listEl.appendChild(_el('div', 'flow-empty', EMPTY_LIST_MESSAGE));
      return;
    }

    for (const flow of this.flows) {
      this.listEl.appendChild(this._createCard(flow));
    }
  }

  _createCard(flow) {
    const isRunning = !!this._runningMap[flow.id];
    const isExpanded = this._expandedCards.has(flow.id);

    const card = _el('div', 'flow-card');
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
        const termArea = _el('div', 'flow-card-terminal');
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
    const headerRow = _el('div', 'flow-card-header');

    // Left: name + schedule + running badge
    const info = _el('div', 'flow-card-info');
    const nameRow = _el('div', 'flow-card-name-row');
    nameRow.appendChild(_el('span', 'flow-card-name', flow.name));
    if (isRunning) nameRow.appendChild(_el('span', 'flow-running-badge', 'En cours...'));
    info.appendChild(nameRow);
    info.appendChild(_el('div', 'flow-card-schedule', this._formatSchedule(flow.schedule)));
    headerRow.appendChild(info);

    // Right: run dots + actions
    const right = _el('div', 'flow-card-right');
    right.appendChild(this._createRunDots(flow));
    right.appendChild(this._createCardActions(flow, isRunning));
    headerRow.appendChild(right);

    return headerRow;
  }

  _createRunDots(flow) {
    const dots = _el('div', 'flow-card-dots');
    for (const run of (flow.runs || []).slice(-MAX_VISIBLE_RUNS)) {
      const dot = _el('button', `flow-dot flow-dot-${run.status}`);
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
    const actions = _el('div', 'flow-card-actions');

    const buttons = [
      !isRunning && ['▶', 'Exécuter maintenant', () => window.api.flow.runNow(flow.id)],
      [flow.enabled ? '⏸' : '⏵', flow.enabled ? 'Désactiver' : 'Activer',
        async () => { await window.api.flow.toggle(flow.id); this.refresh(); }],
      ['✎', 'Modifier', () => this._openModal(flow)],
      ['✕', 'Supprimer', async () => {
        this._disposeLiveTerminal(flow.id);
        await window.api.flow.delete(flow.id);
        this.refresh();
      }, 'flow-card-btn-danger'],
    ];

    for (const entry of buttons) {
      if (entry) actions.appendChild(this._createActionButton(...entry));
    }

    return actions;
  }

  // === Live Terminal (for running flows) ===

  _createActionButton(icon, title, onClick, extraClass = '') {
    const btn = _el('button', extraClass ? `flow-card-btn ${extraClass}` : 'flow-card-btn', icon);
    btn.title = title;
    btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return btn;
  }

  _createReadonlyTerminal(containerEl, termOpts = {}) {
    const term = new Terminal({
      theme: getTerminalTheme(),
      ...READONLY_TERMINAL_OPTIONS,
      scrollback: LIVE_SCROLLBACK,
      ...termOpts,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);

    const resizeObs = new ResizeObserver(() => _safeFit(fitAddon));
    resizeObs.observe(containerEl);
    setTimeout(() => _safeFit(fitAddon), FIT_DELAY_MS);

    return { term, fitAddon, resizeObs };
  }

  _createLiveTerminal(flowId, ptyId) {
    // If we already have a terminal for this flow, reattach it
    const existing = this._liveTerminals.get(flowId);
    if (existing) {
      setTimeout(() => _safeFit(existing.fitAddon), FIT_DELAY_MS);
      return existing.containerEl;
    }

    const containerEl = _el('div', 'flow-card-terminal');

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
    this._logTerminals.set(flowId, { term, fitAddon, resizeObs });
  }

  _disposeLogTerminal(flowId) {
    this._disposeTerminalEntry(this._logTerminals, flowId);
  }

  // === Past Run Log Viewer (modal) ===

  async _showRunLog(flow, run) {
    const log = await window.api.flow.getRunLog(flow.id, run.logTimestamp);

    const overlay = _el('div', 'flow-modal-overlay');
    const modal = _el('div', 'flow-log-modal');

    // Header
    const header = _el('div', 'flow-log-header');
    header.appendChild(_el('span', 'flow-log-title', `${flow.name} — ${run.date}`));
    header.appendChild(_el('span', `flow-log-status flow-log-status-${run.status}`, STATUS_LABELS[run.status] || run.status));
    const closeBtn = _el('button', 'flow-log-close', '✕');
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Terminal to replay the log
    const termContainer = _el('div', 'flow-log-terminal');
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
    this._disposeAllFromMap(this._liveTerminals);
    this._disposeAllFromMap(this._logTerminals);
  }
}
