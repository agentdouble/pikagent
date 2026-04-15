/**
 * Pure rendering helpers for flow cards.
 * Extracted from flow-view.js to reduce component size.
 */
import { _el, createActionButton, renderButtonBar } from './dom.js';
import { formatSchedule } from './flow-schedule-helpers.js';
import { MAX_VISIBLE_RUNS, buildDotTooltip, buildCardActionEntries } from './flow-view-helpers.js';

/**
 * Create the run-status dots row for a flow card.
 * @param {{ runs?: Array<{ status: string, date?: string, timestamp?: number }> }} flow
 * @param {(flow: { runs?: Array<unknown> }, run: { status: string, date?: string, timestamp?: number }) => void} onShowLog
 */
function createRunDots(flow, onShowLog) {
  const dots = _el('div', 'flow-card-dots');
  for (const run of (flow.runs || []).slice(-MAX_VISIBLE_RUNS)) {
    const dot = createActionButton({
      cls: `flow-dot flow-dot-${run.status}`,
      title: buildDotTooltip(run),
      stopPropagation: true,
      onClick: () => onShowLog(flow, run),
    });
    dots.appendChild(dot);
  }
  return dots;
}

/**
 * Create the action buttons row for a flow card.
 * @param {{ enabled?: boolean }} flow
 * @param {boolean} isRunning
 * @param {{ run: () => void, toggle: () => void, edit: () => void, delete: () => void }} handlers
 */
function createCardActions(flow, isRunning, handlers) {
  const configs = buildCardActionEntries(flow, isRunning).map(({ text, title, action, cls }) => ({
    text,
    title,
    cls: cls ? `flow-card-btn ${cls}` : 'flow-card-btn',
    action,
    stopPropagation: true,
  }));
  return renderButtonBar({ containerClass: 'flow-card-actions', configs, handlers });
}

/**
 * Create the full header row for a flow card.
 * @param {{ id: string, name: string, enabled?: boolean, schedule?: unknown, runs?: Array<{ status: string, date?: string, timestamp?: number }> }} flow
 * @param {boolean} isRunning
 * @param {boolean} isExpanded
 * @param {{ onToggleOutput: (flowId: string) => void, onShowLog: (flow: unknown, run: unknown) => void, actionHandlers: { run: () => void, toggle: () => void, edit: () => void, delete: () => void } }} opts
 */
export function createCardHeader(flow, isRunning, isExpanded, opts) {
  const headerRow = _el('div', 'flow-card-header');

  const info = _el('div', 'flow-card-info');
  const nameRow = _el('div', 'flow-card-name-row');
  nameRow.appendChild(_el('span', 'flow-card-name', flow.name));
  if (isRunning) nameRow.appendChild(_el('span', 'flow-running-badge', 'En cours...'));
  if (isRunning) {
    nameRow.appendChild(createActionButton({
      text: isExpanded ? '▾ Sortie' : '▸ Sortie',
      cls: 'flow-output-toggle',
      title: isExpanded ? 'Masquer la sortie' : 'Afficher la sortie',
      stopPropagation: true,
      onClick: () => opts.onToggleOutput(flow.id),
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
