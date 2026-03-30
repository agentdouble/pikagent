import { _el } from './dom.js';

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

export function _createSelect(options, value) {
  const select = _el('select', { className: 'flow-modal-select' });
  for (const [val, label] of Object.entries(options)) {
    select.appendChild(_el('option', { value: val, textContent: label }));
  }
  select.value = value;
  return select;
}

export function _createChip(icon, content, extra = {}) {
  const children = [];
  if (icon) children.push(_el('span', { textContent: icon }));
  children.push(content);
  return _el('div', { className: 'flow-modal-chip', ...extra }, ...children);
}

export function _updateScheduleVis(type, chips) {
  const isInterval = type === 'interval';
  _vis(chips.timeChip, !isInterval);
  _vis(chips.intervalChip, isInterval);
  _vis(chips.daysChip, type === 'custom');
}
