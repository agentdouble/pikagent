import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { generateId } from '../utils/id.js';

const AGENT_OPTIONS = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
};

const SCHEDULE_LABELS = {
  daily: 'Tous les jours',
  weekdays: 'Jours de la semaine',
  custom: 'Personnalisé',
};

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

const TERM_THEME = {
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
      empty.textContent = 'Aucun flow. Créez-en un pour automatiser vos tâches.';
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

    // === Header row ===
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

    // Run history dots (all clickable to view logs)
    const dots = document.createElement('div');
    dots.className = 'flow-card-dots';
    const runs = (flow.runs || []).slice(-5);
    for (const run of runs) {
      const dot = document.createElement('button');
      dot.className = `flow-dot flow-dot-${run.status}`;
      dot.title = `${run.date} — ${run.status === 'success' ? 'Succès' : 'Erreur'}\nCliquer pour voir le log`;
      dot.addEventListener('click', (e) => {
        e.stopPropagation();
        this._showRunLog(flow, run);
      });
      dots.appendChild(dot);
    }
    right.appendChild(dots);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'flow-card-actions';

    if (!isRunning) {
      const runBtn = document.createElement('button');
      runBtn.className = 'flow-card-btn';
      runBtn.textContent = '▶';
      runBtn.title = 'Exécuter maintenant';
      runBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await window.api.flow.runNow(flow.id);
      });
      actions.appendChild(runBtn);
    }

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'flow-card-btn';
    toggleBtn.textContent = flow.enabled ? '⏸' : '⏵';
    toggleBtn.title = flow.enabled ? 'Désactiver' : 'Activer';
    toggleBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.flow.toggle(flow.id);
      this.refresh();
    });
    actions.appendChild(toggleBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'flow-card-btn';
    editBtn.textContent = '✎';
    editBtn.title = 'Modifier';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openModal(flow);
    });
    actions.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'flow-card-btn flow-card-btn-danger';
    delBtn.textContent = '✕';
    delBtn.title = 'Supprimer';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      this._disposeLiveTerminal(flow.id);
      await window.api.flow.delete(flow.id);
      this.refresh();
    });
    actions.appendChild(delBtn);

    right.appendChild(actions);
    headerRow.appendChild(right);

    card.appendChild(headerRow);

    // === Terminal area ===
    if (isRunning) {
      // Live terminal for running flows
      const termArea = this._createLiveTerminal(flow.id, this._runningMap[flow.id]);
      card.appendChild(termArea);
    } else if (isExpanded) {
      // Show last run log inline
      const lastRun = (flow.runs || []).slice(-1)[0];
      if (lastRun) {
        const termArea = document.createElement('div');
        termArea.className = 'flow-card-terminal';
        card.appendChild(termArea);
        this._loadLogIntoContainer(flow.id, lastRun, termArea);
      }
    }

    // Click header to toggle expand/collapse (show last log)
    headerRow.addEventListener('click', () => {
      if (isRunning) return;
      const hasRuns = flow.runs && flow.runs.length > 0;
      if (!hasRuns) {
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

  // === Live Terminal (for running flows) ===

  _createLiveTerminal(flowId, ptyId) {
    // If we already have a terminal for this flow, reattach it
    const existing = this._liveTerminals.get(flowId);
    if (existing) {
      // Refit after reattach
      setTimeout(() => {
        try { existing.fitAddon.fit(); } catch {}
      }, 50);
      return existing.containerEl;
    }

    const containerEl = document.createElement('div');
    containerEl.className = 'flow-card-terminal';

    const term = new Terminal({
      theme: TERM_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: false,
      cursorStyle: 'bar',
      scrollback: 10000,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);

    // Subscribe to PTY data
    const unsubData = window.api.pty.onData(({ id, data }) => {
      if (id === ptyId) {
        term.write(data);
      }
    });

    const resizeObs = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    resizeObs.observe(containerEl);

    this._liveTerminals.set(flowId, { term, fitAddon, unsubData, resizeObs, containerEl, ptyId });

    setTimeout(() => {
      try { fitAddon.fit(); } catch {}
    }, 100);

    return containerEl;
  }

  _disposeLiveTerminal(flowId) {
    const data = this._liveTerminals.get(flowId);
    if (!data) return;
    if (data.unsubData) data.unsubData();
    if (data.resizeObs) data.resizeObs.disconnect();
    data.term.dispose();
    this._liveTerminals.delete(flowId);
  }

  // === Inline Log Terminal (expanded card) ===

  async _loadLogIntoContainer(flowId, run, containerEl) {
    const log = run.logTimestamp
      ? await window.api.flow.getRunLog(flowId, run.logTimestamp)
      : null;

    const term = new Terminal({
      theme: TERM_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: false,
      scrollback: 50000,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerEl);

    if (log) {
      term.write(log);
    } else {
      term.write('\r\n  Log non disponible pour ce run.\r\n');
    }

    const resizeObs = new ResizeObserver(() => {
      try { fitAddon.fit(); } catch {}
    });
    resizeObs.observe(containerEl);

    this._logTerminals = this._logTerminals || new Map();
    this._logTerminals.set(flowId, { term, fitAddon, resizeObs });

    setTimeout(() => {
      try { fitAddon.fit(); } catch {}
    }, 50);
  }

  _disposeLogTerminal(flowId) {
    if (!this._logTerminals) return;
    const data = this._logTerminals.get(flowId);
    if (!data) return;
    if (data.resizeObs) data.resizeObs.disconnect();
    data.term.dispose();
    this._logTerminals.delete(flowId);
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
    statusBadge.textContent = run.status === 'success' ? 'Succès' : 'Erreur';
    header.appendChild(statusBadge);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'flow-log-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => {
      logTerm.dispose();
      overlay.remove();
    });
    header.appendChild(closeBtn);

    modal.appendChild(header);

    // Terminal to replay the log
    const termContainer = document.createElement('div');
    termContainer.className = 'flow-log-terminal';
    modal.appendChild(termContainer);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const logTerm = new Terminal({
      theme: TERM_THEME,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 12,
      lineHeight: 1.3,
      cursorBlink: false,
      scrollback: 50000,
      disableStdin: true,
    });

    const logFit = new FitAddon();
    logTerm.loadAddon(logFit);
    logTerm.open(termContainer);

    setTimeout(() => {
      try { logFit.fit(); } catch {}
    }, 50);

    // Write the log content (raw terminal output with ANSI codes)
    if (log) {
      logTerm.write(log);
    } else {
      logTerm.write('\r\n  Log non disponible.\r\n');
    }

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        logTerm.dispose();
        overlay.remove();
      }
    });

    // Resize handler
    const obs = new ResizeObserver(() => {
      try { logFit.fit(); } catch {}
    });
    obs.observe(termContainer);
  }

  _formatSchedule(schedule) {
    if (!schedule) return 'Non planifié';
    const label = SCHEDULE_LABELS[schedule.type] || schedule.type;
    const time = schedule.time || '00:00';
    if (schedule.type === 'custom' && schedule.days) {
      const dayLabels = schedule.days.map((d) => DAY_NAMES[d]).join(', ');
      return `${dayLabels} à ${time}`;
    }
    return `${label} à ${time}`;
  }

  // ===== Creation / Edit Modal =====

  _openModal(existing = null) {
    const overlay = document.createElement('div');
    overlay.className = 'flow-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'flow-modal';

    // Header
    const modalHeader = document.createElement('div');
    modalHeader.className = 'flow-modal-header';

    const modalTitle = document.createElement('h3');
    modalTitle.textContent = existing ? 'Modifier le flow' : 'Nouveau flow';
    modalHeader.appendChild(modalTitle);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'flow-modal-clear-btn';
    clearBtn.textContent = 'Clear';
    clearBtn.addEventListener('click', () => {
      nameInput.value = '';
      promptArea.value = '';
      selectedCwd = '';
      cwdLabel.textContent = 'Sélectionner un dossier';
      cwdChip.title = 'Sélectionner un dossier';
    });
    modalHeader.appendChild(clearBtn);

    modal.appendChild(modalHeader);

    // Name
    const nameGroup = document.createElement('div');
    nameGroup.className = 'flow-modal-group';
    const nameInput = document.createElement('input');
    nameInput.className = 'flow-modal-input';
    nameInput.placeholder = 'Nom du flow';
    nameInput.value = existing?.name || '';
    nameGroup.appendChild(nameInput);
    modal.appendChild(nameGroup);

    // Prompt
    const promptGroup = document.createElement('div');
    promptGroup.className = 'flow-modal-group';
    const promptArea = document.createElement('textarea');
    promptArea.className = 'flow-modal-textarea';
    promptArea.placeholder = 'Prompt à envoyer à l\'agent...\n\nExemple:\nSummarize yesterday\'s git activity for standup.\n\nGrounding rules:\n- Anchor statements to commits/PRs/files\n- Keep it scannable and team-ready.';
    promptArea.rows = 8;
    promptArea.value = existing?.prompt || '';
    promptGroup.appendChild(promptArea);
    modal.appendChild(promptGroup);

    // Bottom bar: cwd + schedule + actions
    const bottomBar = document.createElement('div');
    bottomBar.className = 'flow-modal-bottom';

    // CWD folder picker
    let selectedCwd = existing?.cwd || '';
    const cwdChip = document.createElement('button');
    cwdChip.className = 'flow-modal-chip flow-modal-chip-btn';
    cwdChip.type = 'button';
    const cwdIcon = document.createElement('span');
    cwdIcon.textContent = '\u{1F4C2}';
    cwdChip.appendChild(cwdIcon);
    const cwdLabel = document.createElement('span');
    cwdLabel.className = 'flow-modal-chip-label';
    cwdLabel.textContent = selectedCwd ? selectedCwd.split('/').pop() : 'Sélectionner un dossier';
    cwdChip.title = selectedCwd || 'Sélectionner un dossier';
    cwdChip.appendChild(cwdLabel);
    cwdChip.addEventListener('click', async (e) => {
      e.preventDefault();
      const folder = await window.api.dialog.openFolder();
      if (folder) {
        selectedCwd = folder;
        cwdLabel.textContent = folder.split('/').pop();
        cwdChip.title = folder;
      }
    });
    bottomBar.appendChild(cwdChip);

    // Agent selector
    const agentChip = document.createElement('div');
    agentChip.className = 'flow-modal-chip';
    const agentIcon = document.createElement('span');
    agentIcon.textContent = '\u{1F916}';
    agentChip.appendChild(agentIcon);
    const agentSelect = document.createElement('select');
    agentSelect.className = 'flow-modal-select';
    for (const [value, label] of Object.entries(AGENT_OPTIONS)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      agentSelect.appendChild(opt);
    }
    agentSelect.value = existing?.agent || 'claude';
    agentChip.appendChild(agentSelect);
    bottomBar.appendChild(agentChip);

    // Schedule type
    const scheduleChip = document.createElement('div');
    scheduleChip.className = 'flow-modal-chip';
    const schedIcon = document.createElement('span');
    schedIcon.textContent = '\u{1F550}';
    scheduleChip.appendChild(schedIcon);
    const schedSelect = document.createElement('select');
    schedSelect.className = 'flow-modal-select';
    for (const [value, label] of Object.entries(SCHEDULE_LABELS)) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      schedSelect.appendChild(opt);
    }
    schedSelect.value = existing?.schedule?.type || 'weekdays';
    scheduleChip.appendChild(schedSelect);
    bottomBar.appendChild(scheduleChip);

    // Time
    const timeChip = document.createElement('div');
    timeChip.className = 'flow-modal-chip';
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'flow-modal-time';
    timeInput.value = existing?.schedule?.time || '09:00';
    timeChip.appendChild(timeInput);
    bottomBar.appendChild(timeChip);

    // Custom days
    const daysChip = document.createElement('div');
    daysChip.className = 'flow-modal-chip flow-modal-days';
    daysChip.style.display = schedSelect.value === 'custom' ? 'flex' : 'none';
    const selectedDays = new Set(existing?.schedule?.days || [1, 2, 3, 4, 5]);
    for (let d = 0; d < 7; d++) {
      const dayBtn = document.createElement('button');
      dayBtn.className = 'flow-day-btn';
      if (selectedDays.has(d)) dayBtn.classList.add('active');
      dayBtn.textContent = DAY_NAMES[d];
      dayBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (selectedDays.has(d)) {
          selectedDays.delete(d);
          dayBtn.classList.remove('active');
        } else {
          selectedDays.add(d);
          dayBtn.classList.add('active');
        }
      });
      daysChip.appendChild(dayBtn);
    }
    bottomBar.appendChild(daysChip);

    schedSelect.addEventListener('change', () => {
      daysChip.style.display = schedSelect.value === 'custom' ? 'flex' : 'none';
    });

    modal.appendChild(bottomBar);

    // Action buttons
    const actionBar = document.createElement('div');
    actionBar.className = 'flow-modal-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'flow-modal-btn flow-modal-btn-cancel';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', () => overlay.remove());
    actionBar.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'flow-modal-btn flow-modal-btn-create';
    saveBtn.textContent = existing ? 'Enregistrer' : 'Créer';
    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const prompt = promptArea.value.trim();
      if (!name || !prompt) return;

      const flow = {
        id: existing?.id || generateId(),
        name,
        prompt,
        agent: agentSelect.value,
        cwd: selectedCwd || undefined,
        schedule: {
          type: schedSelect.value,
          time: timeInput.value || '09:00',
        },
        enabled: existing?.enabled ?? true,
        runs: existing?.runs || [],
      };

      if (schedSelect.value === 'custom') {
        flow.schedule.days = [...selectedDays].sort();
      }

      await window.api.flow.save(flow);
      overlay.remove();
      this.refresh();
    });
    actionBar.appendChild(saveBtn);

    modal.appendChild(actionBar);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    nameInput.focus();
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
