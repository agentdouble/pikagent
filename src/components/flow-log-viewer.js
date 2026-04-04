/**
 * Standalone modal viewer for past flow run logs.
 * Self-contained — creates overlay, terminal, and handles lifecycle.
 */
import { _el } from '../utils/dom.js';
import { createTerminal } from '../utils/terminal-factory.js';
import {
  LOG_SCROLLBACK, NO_LOG_MODAL_MESSAGE, STATUS_LABELS,
  FLOW_TERMINAL_DEFAULTS, formatRunDateTime,
} from '../utils/flow-view-helpers.js';

function buildHeader(flow, run) {
  const header = _el('div', 'flow-log-header');
  header.appendChild(_el('span', 'flow-log-title', `${flow.name} — ${formatRunDateTime(run.date, run.timestamp)}`));
  header.appendChild(_el('span', `flow-log-status flow-log-status-${run.status}`, STATUS_LABELS[run.status] || run.status));
  header.appendChild(_el('button', 'flow-log-close', '✕'));
  return header;
}

export async function showRunLogModal(flow, run) {
  const log = await window.api.flow.getRunLog(flow.id, run.logTimestamp);

  const overlay = _el('div', 'flow-modal-overlay');
  const modal = _el('div', 'flow-log-modal');
  const termContainer = _el('div', 'flow-log-terminal');
  modal.append(buildHeader(flow, run), termContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const { term, resizeObs } = createTerminal(termContainer, {
    ...FLOW_TERMINAL_DEFAULTS,
    scrollback: LOG_SCROLLBACK,
  });

  term.write(log || NO_LOG_MODAL_MESSAGE);

  const close = () => { resizeObs.disconnect(); term.dispose(); overlay.remove(); };
  modal.querySelector('.flow-log-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}
