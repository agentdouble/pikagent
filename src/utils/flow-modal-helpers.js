import { _el } from './flow-dom.js';
import { _vis as _visGeneric } from './dom.js';
import { buildSelect } from './form-helpers.js';
import { SCHEDULE_TYPE_CONFIG } from './flow-schedule-helpers.js';
import { AGENT_OPTIONS } from '../../shared/agent-registry.js';

// --- Constants ---

export { AGENT_OPTIONS };

export const DEFAULT_CWD_LABEL = 'Sélectionner un dossier';

export const SKIP_PERM_CONFIG = {
  claude: { label: 'Skip permissions', title: 'Lance Claude avec --dangerously-skip-permissions' },
  codex: { label: 'Full auto', title: 'Lance Codex avec --approval-mode full-auto au lieu de auto-edit' },
};

// --- Pure helpers ---

/** Flow-specific visibility toggle (uses 'flex' display). */
export function _vis(el, show) {
  _visGeneric(el, show, 'flex');
}

/**
 * Create a <select> for flow modals.
 * Thin wrapper around the centralized `buildSelect` factory from form-helpers.
 */
export function _createSelect(options, value) {
  const items = Object.entries(options).map(([v, label]) => ({ value: v, label }));
  return buildSelect(items, { className: 'flow-modal-select', selected: String(value) });
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
