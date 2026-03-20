import { generateId } from '../utils/id.js';

const SCHEDULE_LABELS = {
  daily: 'Tous les jours',
  weekdays: 'Jours de la semaine',
  custom: 'Personnalisé',
};

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export class FlowView {
  constructor(container, tabManager) {
    this.container = container;
    this.tabManager = tabManager;
    this.flows = [];
    this.disposed = false;

    this._unsubStarted = window.api.flow.onRunStarted(() => this.refresh());
    this._unsubComplete = window.api.flow.onRunComplete(() => this.refresh());

    this.render();
    this.refresh();
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
    const card = document.createElement('div');
    card.className = 'flow-card';
    if (!flow.enabled) card.classList.add('flow-card-disabled');

    // Left: name + schedule
    const info = document.createElement('div');
    info.className = 'flow-card-info';

    const name = document.createElement('div');
    name.className = 'flow-card-name';
    name.textContent = flow.name;
    info.appendChild(name);

    const schedule = document.createElement('div');
    schedule.className = 'flow-card-schedule';
    schedule.textContent = this._formatSchedule(flow.schedule);
    info.appendChild(schedule);

    card.appendChild(info);

    // Right: run dots + actions
    const right = document.createElement('div');
    right.className = 'flow-card-right';

    // Run history dots
    const dots = document.createElement('div');
    dots.className = 'flow-card-dots';
    const runs = (flow.runs || []).slice(-5);
    for (const run of runs) {
      const dot = document.createElement('span');
      dot.className = `flow-dot flow-dot-${run.status}`;
      dot.title = `${run.date} — ${run.status}`;
      dots.appendChild(dot);
    }
    right.appendChild(dots);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'flow-card-actions';

    const runBtn = document.createElement('button');
    runBtn.className = 'flow-card-btn';
    runBtn.textContent = '▶';
    runBtn.title = 'Exécuter maintenant';
    runBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.flow.runNow(flow.id);
      this.refresh();
    });
    actions.appendChild(runBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'flow-card-btn';
    toggleBtn.textContent = flow.enabled ? '⏸' : '▶';
    toggleBtn.title = flow.enabled ? 'Désactiver' : 'Activer';
    toggleBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.flow.toggle(flow.id);
      this.refresh();
    });
    actions.appendChild(toggleBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'flow-card-btn flow-card-btn-danger';
    delBtn.textContent = '✕';
    delBtn.title = 'Supprimer';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await window.api.flow.delete(flow.id);
      this.refresh();
    });
    actions.appendChild(delBtn);

    right.appendChild(actions);
    card.appendChild(right);

    // Click card to edit
    card.addEventListener('click', () => this._openModal(flow));

    return card;
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
    // Overlay
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
      cwdInput.value = '';
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
    promptArea.placeholder = 'Prompt à envoyer à Claude...\n\nExemple:\nSummarize yesterday\'s git activity for standup.\n\nGrounding rules:\n- Anchor statements to commits/PRs/files\n- Keep it scannable and team-ready.';
    promptArea.rows = 8;
    promptArea.value = existing?.prompt || '';
    promptGroup.appendChild(promptArea);
    modal.appendChild(promptGroup);

    // Bottom bar: cwd + schedule + actions
    const bottomBar = document.createElement('div');
    bottomBar.className = 'flow-modal-bottom';

    // CWD selector
    const cwdBtn = document.createElement('div');
    cwdBtn.className = 'flow-modal-chip';
    const cwdIcon = document.createElement('span');
    cwdIcon.textContent = '📂';
    cwdBtn.appendChild(cwdIcon);
    const cwdInput = document.createElement('input');
    cwdInput.className = 'flow-modal-chip-input';
    cwdInput.placeholder = 'Arborescence de travail';
    cwdInput.value = existing?.cwd || '';
    cwdBtn.appendChild(cwdInput);
    bottomBar.appendChild(cwdBtn);

    // Schedule type
    const scheduleChip = document.createElement('div');
    scheduleChip.className = 'flow-modal-chip';
    const schedIcon = document.createElement('span');
    schedIcon.textContent = '🕐';
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

    // Custom days (hidden by default)
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
        cwd: cwdInput.value.trim() || undefined,
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

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Focus name input
    nameInput.focus();
  }

  dispose() {
    this.disposed = true;
    if (this._unsubStarted) this._unsubStarted();
    if (this._unsubComplete) this._unsubComplete();
  }
}
