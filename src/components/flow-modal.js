import { generateId } from '../utils/id.js';
import { _el, createActionButton, createDialogBase } from '../utils/dom-api.js';
import {
  SCHEDULE_LABELS, DAY_NAMES, WEEKDAY_INDICES, INTERVAL_HOURS,
  DEFAULT_TIME, buildScheduleData,
} from '../utils/flow-schedule-helpers.js';
import {
  TRIGGER_TYPE_LABELS, HOOK_PROVIDER_OPTIONS, DEFAULT_HOOK_EVENT,
  DEFAULT_HOOK_DEBOUNCE_SECONDS, buildHookTrigger, joinPathPatterns,
} from '../utils/flow-trigger-helpers.js';
import {
  AGENT_OPTIONS, DEFAULT_CWD_LABEL, SKIP_PERM_CONFIG,
  _vis, _createSelect, _createChip, _updateScheduleVis,
} from '../utils/flow-modal-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import { createAsyncHandler } from '../utils/event-helpers.js';
import { dialogFacade as dialogApi } from '../facades/dialog-facade.js';

// --- Section builders ---

function _buildHeader(existing, state) {
  const title = _el('h3', { textContent: existing ? 'Modifier le flow' : 'Nouveau flow' });
  const clearBtn = createActionButton({
    text: 'Clear',
    cls: 'flow-modal-clear-btn',
    onClick: () => {
      state.nameInput.value = '';
      state.promptArea.value = '';
      state.selectedCwd = '';
      state.cwdLabel.textContent = DEFAULT_CWD_LABEL;
      state.cwdChip.title = DEFAULT_CWD_LABEL;
      if (state.hookEventInput) state.hookEventInput.value = DEFAULT_HOOK_EVENT;
      if (state.hookProviderSelect) state.hookProviderSelect.value = 'any';
      if (state.hookPathsInput) state.hookPathsInput.value = '';
      if (state.hookDebounceInput) state.hookDebounceInput.value = String(DEFAULT_HOOK_DEBOUNCE_SECONDS);
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
    onClick: createAsyncHandler(
      { stopProp: false },
      async () => {
        const folder = await dialogApi.openFolder();
        if (folder) {
          state.selectedCwd = folder;
          cwdLabel.textContent = folder.split('/').pop();
          cwdChip.title = folder;
        }
      },
    ),
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
    const dayBtn = createActionButton({
      text: DAY_NAMES[d],
      cls: 'flow-day-btn',
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

function _buildTriggerChip(existing) {
  const triggerType = existing?.triggerType || (existing?.hookTrigger ? 'hook' : 'schedule');
  const triggerSelect = _createSelect(TRIGGER_TYPE_LABELS, triggerType);
  return { triggerChip: _createChip('Trigger', triggerSelect), triggerSelect };
}

function _buildHookChips(existing, state) {
  const hook = existing?.hookTrigger || {};

  const hookEventInput = _el('input', {
    className: 'flow-modal-chip-input',
    value: hook.event || DEFAULT_HOOK_EVENT,
    placeholder: DEFAULT_HOOK_EVENT,
  });
  const hookProviderSelect = _createSelect(
    Object.fromEntries(HOOK_PROVIDER_OPTIONS.map(provider => [provider, provider])),
    hook.provider || 'any',
  );
  const hookPathsInput = _el('input', {
    className: 'flow-modal-chip-input flow-modal-chip-input-wide',
    value: joinPathPatterns(hook.paths),
    placeholder: 'src/**/*.js, src/**/*.css',
  });
  const hookDebounceInput = _el('input', {
    type: 'number',
    min: 0,
    className: 'flow-modal-number',
    value: String(hook.debounceSeconds ?? DEFAULT_HOOK_DEBOUNCE_SECONDS),
  });

  state.hookEventInput = hookEventInput;
  state.hookProviderSelect = hookProviderSelect;
  state.hookPathsInput = hookPathsInput;
  state.hookDebounceInput = hookDebounceInput;

  return {
    hookEventChip: _createChip('Event', hookEventInput),
    hookProviderChip: _createChip('Source', hookProviderSelect),
    hookPathsChip: _createChip('Paths', hookPathsInput, { className: 'flow-modal-chip flow-modal-chip-wide' }),
    hookDebounceChip: _el('div', { className: 'flow-modal-chip' },
      _el('span', { textContent: 'Debounce' }),
      hookDebounceInput,
      _el('span', { textContent: 's' }),
    ),
    hookEventInput,
    hookProviderSelect,
    hookPathsInput,
    hookDebounceInput,
  };
}

function _updateTriggerVis(triggerType, schedSelect, scheduleTypeChip, schedChips, hookChips) {
  const isSchedule = triggerType === 'schedule';
  _vis(scheduleTypeChip, isSchedule);
  if (isSchedule) {
    _updateScheduleVis(schedSelect.value, schedChips);
  } else {
    _vis(schedChips.timeChip, false);
    _vis(schedChips.intervalChip, false);
    _vis(schedChips.daysChip, false);
  }
  hookChips.forEach((chip) => _vis(chip, !isSchedule));
}

function _buildBottomBar(existing, state) {
  const schedType = existing?.schedule?.type || 'weekdays';
  const cwdChip = _buildCwdPicker(state);

  const agentSelect = _createSelect(AGENT_OPTIONS, existing?.agent || 'claude');
  const { triggerChip, triggerSelect } = _buildTriggerChip(existing);
  const schedSelect = _createSelect(SCHEDULE_LABELS, schedType);
  const scheduleTypeChip = _createChip('\u{1F550}', schedSelect);
  const skipPerm = _buildSkipPermToggle(existing, agentSelect);

  const { timeChip, timeInput } = _buildTimeChip(existing);
  const { intervalChip, intervalInput } = _buildIntervalChip(existing);
  const { daysChip, selectedDays } = _buildDaysChip(existing);
  const hook = _buildHookChips(existing, state);

  const schedChips = { timeChip, intervalChip, daysChip };
  const hookChipList = [hook.hookEventChip, hook.hookProviderChip, hook.hookPathsChip, hook.hookDebounceChip];
  _updateTriggerVis(triggerSelect.value, schedSelect, scheduleTypeChip, schedChips, hookChipList);
  schedSelect.addEventListener('change', () => _updateTriggerVis(triggerSelect.value, schedSelect, scheduleTypeChip, schedChips, hookChipList));
  triggerSelect.addEventListener('change', () => _updateTriggerVis(triggerSelect.value, schedSelect, scheduleTypeChip, schedChips, hookChipList));

  const bar = _el('div', { className: 'flow-modal-bottom' },
    cwdChip,
    _createChip('\u{1F916}', agentSelect),
    skipPerm.chip,
    triggerChip,
    scheduleTypeChip,
    timeChip,
    intervalChip,
    daysChip,
    hook.hookEventChip,
    hook.hookProviderChip,
    hook.hookPathsChip,
    hook.hookDebounceChip,
  );

  return {
    bar,
    agentSelect,
    skipPermCheckbox: skipPerm.checkbox,
    triggerSelect,
    schedSelect,
    timeInput,
    intervalInput,
    selectedDays,
    hookEventInput: hook.hookEventInput,
    hookProviderSelect: hook.hookProviderSelect,
    hookPathsInput: hook.hookPathsInput,
    hookDebounceInput: hook.hookDebounceInput,
  };
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

function _markInvalid(el) {
  el.classList.add('flow-modal-error');
  el.addEventListener('input', () => el.classList.remove('flow-modal-error'), { once: true });
  el.focus();
}

function _collectResult(existing, fields, bottom, catPicker, state) {
  const name = fields.nameInput.value.trim();
  const prompt = fields.promptArea.value.trim();
  if (!name) {
    _markInvalid(fields.nameInput);
    return null;
  }
  if (!prompt) {
    _markInvalid(fields.promptArea);
    return null;
  }

  const result = {
    id: existing?.id || generateId(),
    name,
    prompt,
    agent: bottom.agentSelect.value,
    cwd: state.selectedCwd || undefined,
    schedule: buildScheduleData(bottom.schedSelect.value, bottom.timeInput.value, bottom.intervalInput.value, bottom.selectedDays),
    triggerType: bottom.triggerSelect.value,
    dangerouslySkipPermissions: !!SKIP_PERM_CONFIG[bottom.agentSelect.value] && bottom.skipPermCheckbox.checked,
    enabled: existing?.enabled ?? true,
    runs: existing?.runs || [],
  };
  if (bottom.triggerSelect.value === 'hook') {
    result.hookTrigger = buildHookTrigger(
      bottom.hookEventInput.value,
      bottom.hookProviderSelect.value,
      bottom.hookPathsInput.value,
      bottom.hookDebounceInput.value,
    );
  } else {
    result.hookTrigger = undefined;
  }
  if (catPicker) result._category = catPicker.select.value || '';
  return result;
}

function _buildActionBar(existing, fields, bottom, catPicker, state, cleanup, cancel) {
  const onCreate = () => {
    try {
      const result = _collectResult(existing, fields, bottom, catPicker, state);
      if (!result) return;
      cleanup(result);
    } catch (err) {
      console.error('[flow-modal] failed to build flow', err);
      alert(`Erreur lors de la création du flow : ${err?.message || err}`);
    }
  };

  return _el('div', { className: 'flow-modal-actions' },
    createActionButton({
      text: 'Annuler',
      cls: 'flow-modal-btn flow-modal-btn-cancel',
      onClick: cancel,
    }),
    createActionButton({
      text: existing ? 'Enregistrer' : 'Créer',
      cls: 'flow-modal-btn flow-modal-btn-create',
      onClick: onCreate,
    }),
  );
}

function openFlowModal(existing = null, categories = []) {
  return createDialogBase({
    overlayClass: 'flow-modal-overlay',
    modalClass: 'flow-modal',
    cancelValue: null,
    builder({ modal, cleanup, cancel }) {
      const state = { selectedCwd: existing?.cwd || '' };
      const { fields, bottom, catPicker, modalChildren } = _buildModalDom(existing, categories, state);

      modalChildren.push(_buildActionBar(existing, fields, bottom, catPicker, state, cleanup, cancel));
      modal.append(...modalChildren);

      return () => fields.nameInput.focus();
    },
  });
}

registerComponent('openFlowModal', openFlowModal);
