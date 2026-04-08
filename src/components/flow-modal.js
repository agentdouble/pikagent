import { generateId } from '../utils/id.js';
import { _el, createButton, createModalOverlay } from '../utils/dom.js';
import {
  SCHEDULE_LABELS, DAY_NAMES, WEEKDAY_INDICES, INTERVAL_HOURS,
  DEFAULT_TIME, buildScheduleData,
} from '../utils/flow-schedule-helpers.js';
import {
  AGENT_OPTIONS, DEFAULT_CWD_LABEL, SKIP_PERM_CONFIG,
  _vis, _createSelect, _createChip, _updateScheduleVis,
} from '../utils/flow-modal-helpers.js';

// --- Section builders ---

function _buildHeader(existing, state) {
  const title = _el('h3', { textContent: existing ? 'Modifier le flow' : 'Nouveau flow' });
  const clearBtn = createButton({
    label: 'Clear',
    className: 'flow-modal-clear-btn',
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

function _buildCwdPicker(state) {
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
  return cwdChip;
}

function _buildSkipPermToggle(existing, agentSelect) {
  const checkbox = _el('input', { type: 'checkbox', checked: existing?.dangerouslySkipPermissions || false });
  const label = _el('span', { textContent: 'Skip permissions' });
  label.style.fontSize = '11px';
  const chip = _el('label', {
    className: 'flow-modal-chip flow-modal-chip-toggle',
    title: 'Lance Claude avec --dangerously-skip-permissions',
  }, checkbox, label);
  chip.style.cursor = 'pointer';
  chip.style.gap = '4px';

  function _updateToggle(agent) {
    const cfg = SKIP_PERM_CONFIG[agent];
    _vis(chip, !!cfg);
    if (cfg) {
      label.textContent = cfg.label;
      chip.title = cfg.title;
    }
  }

  _updateToggle(agentSelect.value);
  agentSelect.addEventListener('change', () => _updateToggle(agentSelect.value));

  return { chip, checkbox };
}

function _buildTimeChip(existing) {
  const timeChip = _createChip(null, _el('input', {
    type: 'time',
    className: 'flow-modal-time',
    value: existing?.schedule?.time || DEFAULT_TIME,
  }));
  return { timeChip, timeInput: timeChip.querySelector('input') };
}

function _buildIntervalChip(existing) {
  const intervalInput = _createSelect(
    Object.fromEntries(INTERVAL_HOURS.map(h => [h, `${h}h`])),
    existing?.schedule?.intervalHours || 1,
  );
  const intervalLbl = _el('span', { textContent: 'Toutes les' });
  intervalLbl.style.fontSize = '11px';
  return { intervalChip: _el('div', { className: 'flow-modal-chip' }, intervalLbl, intervalInput), intervalInput };
}

function _buildDaysChip(existing) {
  const selectedDays = new Set(existing?.schedule?.days || WEEKDAY_INDICES);
  const daysChip = _el('div', { className: 'flow-modal-chip flow-modal-days' });
  for (let d = 0; d < 7; d++) {
    const dayBtn = createButton({
      label: DAY_NAMES[d],
      className: 'flow-day-btn',
      onClick: (e) => {
        e.preventDefault();
        selectedDays.has(d) ? selectedDays.delete(d) : selectedDays.add(d);
        dayBtn.classList.toggle('active');
      },
    });
    if (selectedDays.has(d)) dayBtn.classList.add('active');
    daysChip.appendChild(dayBtn);
  }
  return { daysChip, selectedDays };
}

function _buildBottomBar(existing, state) {
  const schedType = existing?.schedule?.type || 'weekdays';
  const cwdChip = _buildCwdPicker(state);

  const agentSelect = _createSelect(AGENT_OPTIONS, existing?.agent || 'claude');
  const schedSelect = _createSelect(SCHEDULE_LABELS, schedType);
  const skipPerm = _buildSkipPermToggle(existing, agentSelect);

  const { timeChip, timeInput } = _buildTimeChip(existing);
  const { intervalChip, intervalInput } = _buildIntervalChip(existing);
  const { daysChip, selectedDays } = _buildDaysChip(existing);

  const schedChips = { timeChip, intervalChip, daysChip };
  _updateScheduleVis(schedType, schedChips);
  schedSelect.addEventListener('change', () => _updateScheduleVis(schedSelect.value, schedChips));

  const bar = _el('div', { className: 'flow-modal-bottom' },
    cwdChip,
    _createChip('\u{1F916}', agentSelect),
    skipPerm.chip,
    _createChip('\u{1F550}', schedSelect),
    timeChip,
    intervalChip,
    daysChip,
  );

  return { bar, agentSelect, skipPermCheckbox: skipPerm.checkbox, schedSelect, timeInput, intervalInput, selectedDays };
}


// --- Category picker ---

function _buildCategoryPicker(categories, selectedCatId) {
  const options = { '': 'Sans catégorie' };
  for (const cat of categories) {
    options[cat.id] = cat.name;
  }
  const select = _createSelect(options, selectedCatId || '');
  return { chip: _createChip('\u{1F4C1}', select), select };
}

// --- Main entry ---

function _buildModalDom(existing, categories, state) {
  const fields = _buildFormFields(existing);
  state.nameInput = fields.nameInput;
  state.promptArea = fields.promptArea;

  const header = _buildHeader(existing, state);
  const bottom = _buildBottomBar(existing, state);
  const catPicker = categories.length > 0
    ? _buildCategoryPicker(categories, existing?._category || '')
    : null;

  const modalChildren = [header, fields.nameGroup, fields.promptGroup];
  if (catPicker) modalChildren.push(_el('div', { className: 'flow-modal-group', style: { paddingBottom: '8px' } }, catPicker.chip));
  modalChildren.push(bottom.bar);

  return { fields, bottom, catPicker, modalChildren };
}

function _buildActionBar(existing, fields, bottom, catPicker, state, overlayRef, resolve) {
  const close = () => { overlayRef.overlay.remove(); resolve(null); };

  const actionBar = _el('div', { className: 'flow-modal-actions' },
    createButton({
      label: 'Annuler',
      className: 'flow-modal-btn flow-modal-btn-cancel',
      onClick: close,
    }),
    createButton({
      label: existing ? 'Enregistrer' : 'Créer',
      className: 'flow-modal-btn flow-modal-btn-create',
      onClick: () => {
        const name = fields.nameInput.value.trim();
        const prompt = fields.promptArea.value.trim();
        if (!name || !prompt) return;

        overlayRef.overlay.remove();
        const result = {
          id: existing?.id || generateId(),
          name,
          prompt,
          agent: bottom.agentSelect.value,
          cwd: state.selectedCwd || undefined,
          schedule: buildScheduleData(bottom.schedSelect.value, bottom.timeInput.value, bottom.intervalInput.value, bottom.selectedDays),
          dangerouslySkipPermissions: !!SKIP_PERM_CONFIG[bottom.agentSelect.value] && bottom.skipPermCheckbox.checked,
          enabled: existing?.enabled ?? true,
          runs: existing?.runs || [],
        };
        if (catPicker) result._category = catPicker.select.value || '';
        resolve(result);
      },
    }),
  );

  return { actionBar, close };
}

export function openFlowModal(existing = null, categories = []) {
  return new Promise((resolve) => {
    const state = { selectedCwd: existing?.cwd || '' };
    const overlayRef = {};

    const { fields, bottom, catPicker, modalChildren } = _buildModalDom(existing, categories, state);
    const { actionBar, close } = _buildActionBar(existing, fields, bottom, catPicker, state, overlayRef, resolve);

    modalChildren.push(actionBar);

    const { overlay, modal } = createModalOverlay('flow-modal-overlay', 'flow-modal', close);
    overlayRef.overlay = overlay;
    modal.append(...modalChildren);

    document.body.appendChild(overlay);
    fields.nameInput.focus();
  });
}
