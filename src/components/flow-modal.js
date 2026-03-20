import { generateId } from '../utils/id.js';

const AGENT_OPTIONS = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
};

const SCHEDULE_LABELS = {
  interval: 'Intervalle',
  daily: 'Tous les jours',
  weekdays: 'Jours de la semaine',
  custom: 'Personnalisé',
};

const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

export { SCHEDULE_LABELS, DAY_NAMES };

/**
 * Opens the flow creation/edit modal.
 * Returns a promise that resolves with the saved flow, or null if cancelled.
 */
export function openFlowModal(existing = null) {
  return new Promise((resolve) => {
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
    timeChip.style.display = schedSelect.value === 'interval' ? 'none' : 'flex';
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'flow-modal-time';
    timeInput.value = existing?.schedule?.time || '09:00';
    timeChip.appendChild(timeInput);
    bottomBar.appendChild(timeChip);

    // Interval hours
    const intervalChip = document.createElement('div');
    intervalChip.className = 'flow-modal-chip';
    intervalChip.style.display = schedSelect.value === 'interval' ? 'flex' : 'none';
    const intervalLabel = document.createElement('span');
    intervalLabel.textContent = 'Toutes les';
    intervalLabel.style.fontSize = '11px';
    intervalChip.appendChild(intervalLabel);
    const intervalInput = document.createElement('select');
    intervalInput.className = 'flow-modal-select';
    for (const h of [1, 2, 3, 4, 6, 8, 12]) {
      const opt = document.createElement('option');
      opt.value = h;
      opt.textContent = `${h}h`;
      intervalInput.appendChild(opt);
    }
    intervalInput.value = existing?.schedule?.intervalHours || 1;
    intervalChip.appendChild(intervalInput);
    bottomBar.appendChild(intervalChip);

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
      const isInterval = schedSelect.value === 'interval';
      daysChip.style.display = schedSelect.value === 'custom' ? 'flex' : 'none';
      timeChip.style.display = isInterval ? 'none' : 'flex';
      intervalChip.style.display = isInterval ? 'flex' : 'none';
    });

    modal.appendChild(bottomBar);

    // Action buttons
    const actionBar = document.createElement('div');
    actionBar.className = 'flow-modal-actions';

    const close = () => {
      overlay.remove();
      resolve(null);
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'flow-modal-btn flow-modal-btn-cancel';
    cancelBtn.textContent = 'Annuler';
    cancelBtn.addEventListener('click', close);
    actionBar.appendChild(cancelBtn);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'flow-modal-btn flow-modal-btn-create';
    saveBtn.textContent = existing ? 'Enregistrer' : 'Créer';
    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      const prompt = promptArea.value.trim();
      if (!name || !prompt) return;

      const schedType = schedSelect.value;
      const schedule = { type: schedType };

      if (schedType === 'interval') {
        schedule.intervalHours = parseInt(intervalInput.value, 10);
      } else {
        schedule.time = timeInput.value || '09:00';
        if (schedType === 'custom') {
          schedule.days = [...selectedDays].sort();
        }
      }

      const flow = {
        id: existing?.id || generateId(),
        name,
        prompt,
        agent: agentSelect.value,
        cwd: selectedCwd || undefined,
        schedule,
        enabled: existing?.enabled ?? true,
        runs: existing?.runs || [],
      };

      overlay.remove();
      resolve(flow);
    });
    actionBar.appendChild(saveBtn);

    modal.appendChild(actionBar);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    nameInput.focus();
  });
}
