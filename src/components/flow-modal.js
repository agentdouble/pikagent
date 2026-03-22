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
const INTERVAL_HOURS = [1, 2, 3, 4, 6, 8, 12];
const DEFAULT_CWD_LABEL = 'Sélectionner un dossier';

export { SCHEDULE_LABELS, DAY_NAMES };

// --- DOM helpers ---

function _el(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') el.className = v;
    else if (k === 'textContent') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el[k] = v;
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}

function _createSelect(options, value) {
  const select = _el('select', { className: 'flow-modal-select' });
  for (const [val, label] of Object.entries(options)) {
    select.appendChild(_el('option', { value: val, textContent: label }));
  }
  select.value = value;
  return select;
}

function _createChip(icon, content, extra = {}) {
  return _el('div', { className: 'flow-modal-chip', ...extra },
    _el('span', { textContent: icon }),
    content,
  );
}

// --- Section builders ---

function _buildHeader(existing, state) {
  const title = _el('h3', { textContent: existing ? 'Modifier le flow' : 'Nouveau flow' });
  const clearBtn = _el('button', {
    className: 'flow-modal-clear-btn',
    textContent: 'Clear',
    onClick: () => {
      state.nameInput.value = '';
      state.promptArea.value = '';
      state.selectedCwd = '';
      state.cwdLabel.textContent = DEFAULT_CWD_LABEL;
      state.cwdChip.title = DEFAULT_CWD_LABEL;
    },
  });
  return _el('div', { className: 'flow-modal-header' }, title, clearBtn);
}

function _buildFormFields(existing) {
  const nameInput = _el('input', {
    className: 'flow-modal-input',
    placeholder: 'Nom du flow',
    value: existing?.name || '',
  });
  const promptArea = _el('textarea', {
    className: 'flow-modal-textarea',
    placeholder: 'Prompt à envoyer à l\'agent...\n\nExemple:\nSummarize yesterday\'s git activity for standup.\n\nGrounding rules:\n- Anchor statements to commits/PRs/files\n- Keep it scannable and team-ready.',
    rows: 8,
    value: existing?.prompt || '',
  });
  return {
    nameInput,
    promptArea,
    nameGroup: _el('div', { className: 'flow-modal-group' }, nameInput),
    promptGroup: _el('div', { className: 'flow-modal-group' }, promptArea),
  };
}

function _buildBottomBar(existing, state) {
  const isInterval = (existing?.schedule?.type || 'weekdays') === 'interval';
  const isCustom = (existing?.schedule?.type || 'weekdays') === 'custom';

  // CWD picker
  const cwdLabel = _el('span', {
    className: 'flow-modal-chip-label',
    textContent: state.selectedCwd ? state.selectedCwd.split('/').pop() : DEFAULT_CWD_LABEL,
  });
  const cwdChip = _el('button', {
    className: 'flow-modal-chip flow-modal-chip-btn',
    type: 'button',
    title: state.selectedCwd || DEFAULT_CWD_LABEL,
    onClick: async (e) => {
      e.preventDefault();
      const folder = await window.api.dialog.openFolder();
      if (folder) {
        state.selectedCwd = folder;
        cwdLabel.textContent = folder.split('/').pop();
        cwdChip.title = folder;
      }
    },
  }, _el('span', { textContent: '\u{1F4C2}' }), cwdLabel);

  state.cwdLabel = cwdLabel;
  state.cwdChip = cwdChip;

  // Selects
  const agentSelect = _createSelect(AGENT_OPTIONS, existing?.agent || 'claude');
  const schedSelect = _createSelect(SCHEDULE_LABELS, existing?.schedule?.type || 'weekdays');
  const intervalInput = _createSelect(
    Object.fromEntries(INTERVAL_HOURS.map(h => [h, `${h}h`])),
    existing?.schedule?.intervalHours || 1,
  );

  // Dangerously skip permissions toggle (Claude only)
  const skipPermCheckbox = _el('input', { type: 'checkbox', checked: existing?.dangerouslySkipPermissions || false });
  const skipPermLabel = _el('span', { textContent: 'Skip permissions' });
  skipPermLabel.style.fontSize = '11px';
  const skipPermChip = _el('label', {
    className: 'flow-modal-chip flow-modal-chip-toggle',
    title: 'Lance Claude avec --dangerously-skip-permissions',
  }, skipPermCheckbox, skipPermLabel);
  skipPermChip.style.display = (agentSelect.value === 'claude') ? 'flex' : 'none';
  skipPermChip.style.cursor = 'pointer';
  skipPermChip.style.gap = '4px';

  agentSelect.addEventListener('change', () => {
    skipPermChip.style.display = (agentSelect.value === 'claude') ? 'flex' : 'none';
  });

  // Time input
  const timeChip = _createChip('', _el('input', {
    type: 'time',
    className: 'flow-modal-time',
    value: existing?.schedule?.time || '09:00',
  }));
  timeChip.style.display = isInterval ? 'none' : 'flex';
  // Remove the empty icon span for time chip
  timeChip.removeChild(timeChip.firstChild);
  const timeInput = timeChip.querySelector('input');

  // Interval chip
  const intervalLbl = _el('span', { textContent: 'Toutes les' });
  intervalLbl.style.fontSize = '11px';
  const intervalChip = _el('div', { className: 'flow-modal-chip' }, intervalLbl, intervalInput);
  intervalChip.style.display = isInterval ? 'flex' : 'none';

  // Days chip
  const selectedDays = new Set(existing?.schedule?.days || [1, 2, 3, 4, 5]);
  const daysChip = _el('div', { className: 'flow-modal-chip flow-modal-days' });
  daysChip.style.display = isCustom ? 'flex' : 'none';
  for (let d = 0; d < 7; d++) {
    const dayBtn = _el('button', {
      className: 'flow-day-btn',
      textContent: DAY_NAMES[d],
      onClick: (e) => {
        e.preventDefault();
        selectedDays.has(d) ? selectedDays.delete(d) : selectedDays.add(d);
        dayBtn.classList.toggle('active');
      },
    });
    if (selectedDays.has(d)) dayBtn.classList.add('active');
    daysChip.appendChild(dayBtn);
  }

  // Toggle visibility on schedule change
  schedSelect.addEventListener('change', () => {
    const iv = schedSelect.value === 'interval';
    daysChip.style.display = schedSelect.value === 'custom' ? 'flex' : 'none';
    timeChip.style.display = iv ? 'none' : 'flex';
    intervalChip.style.display = iv ? 'flex' : 'none';
  });

  const bar = _el('div', { className: 'flow-modal-bottom' },
    cwdChip,
    _createChip('\u{1F916}', agentSelect),
    skipPermChip,
    _createChip('\u{1F550}', schedSelect),
    timeChip,
    intervalChip,
    daysChip,
  );

  return { bar, agentSelect, skipPermCheckbox, schedSelect, timeInput, intervalInput, selectedDays };
}

function _buildSchedule(schedSelect, timeInput, intervalInput, selectedDays) {
  const type = schedSelect.value;
  const schedule = { type };
  if (type === 'interval') {
    schedule.intervalHours = parseInt(intervalInput.value, 10);
  } else {
    schedule.time = timeInput.value || '09:00';
    if (type === 'custom') schedule.days = [...selectedDays].sort();
  }
  return schedule;
}

// --- Main entry ---

export function openFlowModal(existing = null) {
  return new Promise((resolve) => {
    const state = { selectedCwd: existing?.cwd || '' };

    const fields = _buildFormFields(existing);
    state.nameInput = fields.nameInput;
    state.promptArea = fields.promptArea;

    const header = _buildHeader(existing, state);
    const bottom = _buildBottomBar(existing, state);

    const close = () => { overlay.remove(); resolve(null); };

    const actionBar = _el('div', { className: 'flow-modal-actions' },
      _el('button', {
        className: 'flow-modal-btn flow-modal-btn-cancel',
        textContent: 'Annuler',
        onClick: close,
      }),
      _el('button', {
        className: 'flow-modal-btn flow-modal-btn-create',
        textContent: existing ? 'Enregistrer' : 'Créer',
        onClick: () => {
          const name = fields.nameInput.value.trim();
          const prompt = fields.promptArea.value.trim();
          if (!name || !prompt) return;

          overlay.remove();
          resolve({
            id: existing?.id || generateId(),
            name,
            prompt,
            agent: bottom.agentSelect.value,
            cwd: state.selectedCwd || undefined,
            schedule: _buildSchedule(bottom.schedSelect, bottom.timeInput, bottom.intervalInput, bottom.selectedDays),
            dangerouslySkipPermissions: bottom.agentSelect.value === 'claude' && bottom.skipPermCheckbox.checked,
            enabled: existing?.enabled ?? true,
            runs: existing?.runs || [],
          });
        },
      }),
    );

    const modal = _el('div', { className: 'flow-modal' },
      header, fields.nameGroup, fields.promptGroup, bottom.bar, actionBar,
    );

    const overlay = _el('div', { className: 'flow-modal-overlay' },
      modal,
    );
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);
    fields.nameInput.focus();
  });
}
