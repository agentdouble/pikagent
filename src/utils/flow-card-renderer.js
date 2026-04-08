/**
 * Pure rendering helpers for flow cards.
 * Extracted from flow-view.js to reduce component size.
 */
import { _el, createButton } from './dom.js';
import { formatSchedule } from './flow-schedule-helpers.js';
import { MAX_VISIBLE_RUNS, buildDotTooltip, buildCardActionEntries } from './flow-view-helpers.js';

/**
 * Create a single action button for a flow card.
 * Thin wrapper around the centralized `createButton` factory.
 */
function createFlowActionButton(icon, title, onClick, extraClass = '') {
  return createButton({
    label: icon,
    title,
    className: extraClass ? `flow-card-btn ${extraClass}` : 'flow-card-btn',
    onClick: (e) => { e.stopPropagation(); onClick(); },
  });
}

/**
 * Create the run-status dots row for a flow card.
 * @param {Object} flow
 * @param {function} onShowLog - (flow, run) => void
 */
function createRunDots(flow, onShowLog) {
  const dots = _el('div', 'flow-card-dots');
  for (const run of (flow.runs || []).slice(-MAX_VISIBLE_RUNS)) {
    const dot = createButton({
      className: `flow-dot flow-dot-${run.status}`,
      title: buildDotTooltip(run),
      onClick: (e) => { e.stopPropagation(); onShowLog(flow, run); },
    });
    dots.appendChild(dot);
  }
  return dots;
}

/**
 * Create the action buttons row for a flow card.
 * @param {Object} flow
 * @param {boolean} isRunning
 * @param {Object} handlers - { run, toggle, edit, delete }
 */
function createCardActions(flow, isRunning, handlers) {
  const actions = _el('div', 'flow-card-actions');
  for (const { icon, title, action, cls } of buildCardActionEntries(flow, isRunning)) {
    actions.appendChild(createFlowActionButton(icon, title, handlers[action], cls));
  }
  return actions;
}

/**
 * Create the full header row for a flow card.
 * @param {Object} flow
 * @param {boolean} isRunning
 * @param {boolean} isExpanded
 * @param {Object} opts - { onToggleOutput, onShowLog, actionHandlers }
 */
export function createCardHeader(flow, isRunning, isExpanded, opts) {
  const headerRow = _el('div', 'flow-card-header');

  const info = _el('div', 'flow-card-info');
  const nameRow = _el('div', 'flow-card-name-row');
  nameRow.appendChild(_el('span', 'flow-card-name', flow.name));
  if (isRunning) nameRow.appendChild(_el('span', 'flow-running-badge', 'En cours...'));
  if (isRunning) {
    nameRow.appendChild(createButton({
      label: isExpanded ? '▾ Sortie' : '▸ Sortie',
      className: 'flow-output-toggle',
      title: isExpanded ? 'Masquer la sortie' : 'Afficher la sortie',
      onClick: (e) => { e.stopPropagation(); opts.onToggleOutput(flow.id); },
    }));
  }
  info.appendChild(nameRow);
  info.appendChild(_el('div', 'flow-card-schedule', formatSchedule(flow.schedule)));
  headerRow.appendChild(info);

  const right = _el('div', 'flow-card-right');
  right.appendChild(createRunDots(flow, opts.onShowLog));
  right.appendChild(createCardActions(flow, isRunning, opts.actionHandlers));
  headerRow.appendChild(right);

  return headerRow;
}
