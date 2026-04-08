/**
 * Terminal management for flow cards: live terminals, inline log terminals, and log modal.
 * Extracted from FlowView to reduce component size.
 */
import { _el, _safeFit } from '../utils/dom.js';
import { createReadonlyTerminal, disposeTerminal, disposeTerminalMap } from '../utils/terminal-factory.js';
import {
  FIT_DELAY_MS, LOG_SCROLLBACK, LIVE_SCROLLBACK,
  STATUS_LABELS, NO_LOG_MESSAGE, NO_LOG_MODAL_MESSAGE,
  formatRunDateTime,
} from '../utils/flow-view-helpers.js';
import { registerComponent } from '../utils/component-registry.js';

export class FlowCardTerminalManager {
  constructor() {
    this._liveTerminals = new Map();
    this._logTerminals = new Map();
  }

  // === Shared helpers ===

  _createReadonlyTerminal(containerEl, termOpts = {}) {
    return createReadonlyTerminal(containerEl, {
      scrollback: LIVE_SCROLLBACK,
      fitDelay: FIT_DELAY_MS,
      ...termOpts,
    });
  }

  _disposeTerminalEntry(map, flowId) {
    const data = map.get(flowId);
    if (!data) return;
    disposeTerminal(data);
    map.delete(flowId);
  }

  // === Live Terminal (for running flows) ===

  createLiveTerminal(flowId, ptyId) {
    const existing = this._liveTerminals.get(flowId);
    if (existing) {
      setTimeout(() => _safeFit(existing.fitAddon), FIT_DELAY_MS);
      return existing.containerEl;
    }

    const containerEl = _el('div', 'flow-card-terminal');

    const { term, fitAddon, resizeObs } = this._createReadonlyTerminal(containerEl, {
      scrollback: LIVE_SCROLLBACK,
      cursorStyle: 'bar',
    });

    const unsubData = window.api.pty.onData(ptyId, (data) => {
      term.write(data);
    });

    this._liveTerminals.set(flowId, { term, fitAddon, unsubData, resizeObs, containerEl, ptyId });

    return containerEl;
  }

  disposeLiveTerminal(flowId) {
    this._disposeTerminalEntry(this._liveTerminals, flowId);
  }

  // === Inline Log Terminal (expanded card) ===

  async loadLogIntoContainer(flowId, run, containerEl) {
    const log = run.logTimestamp
      ? await window.api.flow.getRunLog(flowId, run.logTimestamp)
      : null;

    const { term, fitAddon, resizeObs } = this._createReadonlyTerminal(containerEl, {
      scrollback: LOG_SCROLLBACK,
    });

    term.write(log || NO_LOG_MESSAGE);
    this._logTerminals.set(flowId, { term, fitAddon, resizeObs });
  }

  disposeLogTerminal(flowId) {
    this._disposeTerminalEntry(this._logTerminals, flowId);
  }

  // === Past Run Log Viewer (modal) ===

  _buildLogModalHeader(flow, run) {
    const header = _el('div', 'flow-log-header');
    header.appendChild(_el('span', 'flow-log-title', `${flow.name} — ${formatRunDateTime(run.date, run.timestamp)}`));
    header.appendChild(_el('span', `flow-log-status flow-log-status-${run.status}`, STATUS_LABELS[run.status] || run.status));
    header.appendChild(_el('button', 'flow-log-close', '✕'));
    return header;
  }

  async showRunLog(flow, run) {
    const log = await window.api.flow.getRunLog(flow.id, run.logTimestamp);

    const overlay = _el('div', 'flow-modal-overlay');
    const modal = _el('div', 'flow-log-modal');
    const termContainer = _el('div', 'flow-log-terminal');
    modal.append(this._buildLogModalHeader(flow, run), termContainer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const { term, resizeObs } = this._createReadonlyTerminal(termContainer, {
      scrollback: LOG_SCROLLBACK,
    });

    term.write(log || NO_LOG_MODAL_MESSAGE);

    const close = () => { resizeObs.disconnect(); term.dispose(); overlay.remove(); };
    modal.querySelector('.flow-log-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }

  // === Cleanup on render / refresh ===

  cleanupStaleLiveTerminals(runningMap) {
    for (const [flowId] of this._liveTerminals) {
      if (!runningMap[flowId]) this.disposeLiveTerminal(flowId);
    }
  }

  disposeAllLogTerminals() {
    disposeTerminalMap(this._logTerminals);
  }

  disposeAll() {
    disposeTerminalMap(this._liveTerminals);
    disposeTerminalMap(this._logTerminals);
  }
}

registerComponent('FlowCardTerminalManager', FlowCardTerminalManager);
