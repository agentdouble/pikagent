import { _el, createSelect } from './dom-dialogs.js';
import { SCHEDULE_TYPE_CONFIG } from './flow-schedule-helpers.js';

// --- Constants ---

export const AGENT_OPTIONS = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
};

export const DEFAULT_CWD_LABEL = 'Sélectionner un dossier';

export const SKIP_PERM_CONFIG = {
  claude: { label: 'Skip permissions', title: 'Lance Claude avec --dangerously-skip-permissions' },
  codex: { label: 'Full auto', title: 'Lance Codex avec --approval-mode full-auto au lieu de auto-edit' },
};

// --- Pure helpers ---

export function _vis(el, show) {
  el.style.display = show ? 'flex' : 'none';
}

/**
 * Create a <select> for flow modals.
 * Thin wrapper around the centralized `createSelect` factory.
 */
export function _createSelect(options, value) {
  return createSelect({ options, value, className: 'flow-modal-select' });
}

export function _createChip(icon, content, extra = {}) {
  const children = [];
  if (icon) children.push(_el('span', { textContent: icon }));
  children.push(content);
  return _el('div', { className: 'flow-modal-chip', ...extra }, ...children);
}

export function _updateScheduleVis(type, chips) {
  const { time, interval, days } = SCHEDULE_TYPE_CONFIG[type].chips;
  _vis(chips.timeChip, time);
  _vis(chips.intervalChip, interval);
  _vis(chips.daysChip, days);
}
