/**
 * Terminal management for flow cards: live terminals, inline log terminals, and log modal.
 * Extracted from FlowView to reduce component size.
 */
import { _el } from '../utils/dom-api.js';
import { createModalOverlay } from '../utils/dom-dialogs.js';
import { onKeyAction } from '../utils/event-helpers.js';
import { _safeFit, createPtyBoundTerminal, disposeTerminal, disposeTerminalMap } from '../utils/terminal-factory.js';
import {
  FLOW_FIT_DELAY_MS, LOG_SCROLLBACK, LIVE_SCROLLBACK,
  STATUS_LABELS, NO_LOG_MESSAGE, NO_LOG_MODAL_MESSAGE,
  formatRunDateTime,
} from '../utils/flow-view-helpers.js';
import { registerComponent } from '../utils/component-registry.js';
import { ptyApi, flowApi } from '../facades/flow-card-terminal-services.js';

class FlowCardTerminalManager {
  constructor() {
    this._liveTerminals = new Map();
    this._logTerminals = new Map();
  }

  // === Shared helpers ===

  _disposeTerminalEntry(map, flowId) {
    const data = map.get(flowId);
    if (!data) return;
    disposeTerminal(data);
    map.delete(flowId);
  }

  /**
   * Create a readonly terminal, register it in the given map, and run an
   * optional setup callback.  Returns the terminal record.
   * @param {Map<string, { term: import('@xterm/xterm').Terminal, fitAddon: import('@xterm/addon-fit').FitAddon, resizeObs: ResizeObserver|null, unsubData: (() => void)|null, containerEl: HTMLElement }>} map - target map (_liveTerminals or _logTerminals)
   * @param {string} flowId
   * @param {HTMLElement} containerEl
   * @param {{ scrollback?: number, cursorStyle?: string, [key: string]: unknown }} opts - extra terminal options (scrollback, cursorStyle, …)
   * @param {{ onPtyData?: (cb: (data: string) => void) => (() => void), setupFn?: (record: { term: import('@xterm/xterm').Terminal, fitAddon: import('@xterm/addon-fit').FitAddon, resizeObs: ResizeObserver|null, unsubData: (() => void)|null }) => void }} [extra] - optional PTY data subscriber and/or post-creation callback
   * @returns {{ term: import('@xterm/xterm').Terminal, fitAddon: import('@xterm/addon-fit').FitAddon, resizeObs: ResizeObserver|null, unsubData: (() => void)|null }} the terminal record stored in the map
   */
  _createAndRegister(map, flowId, containerEl, opts, extra = {}) {
    const { onPtyData, setupFn } = typeof extra === 'function' ? { setupFn: extra } : extra;
    const record = createPtyBoundTerminal(containerEl, {
      termOpts: { scrollback: LIVE_SCROLLBACK, ...opts },
      fitDelay: FLOW_FIT_DELAY_MS,
      ...(onPtyData ? { onPtyData } : {}),
    });
    if (setupFn) setupFn(record);
    map.set(flowId, { ...record, containerEl });
    return record;
  }

  // === Live Terminal (for running flows) ===

  createLiveTerminal(flowId, ptyId) {
    const existing = this._liveTerminals.get(flowId);
    if (existing) {
      setTimeout(() => _safeFit(existing.fitAddon), FLOW_FIT_DELAY_MS);
      return existing.containerEl;
    }

    const containerEl = _el('div', 'flow-card-terminal');

    this._createAndRegister(
      this._liveTerminals, flowId, containerEl,
      { cursorStyle: 'bar' },
      { onPtyData: (writeFn) => ptyApi.onData(ptyId, writeFn) },
    );

    // Attach ptyId to the stored entry for external reference.
    this._liveTerminals.get(flowId).ptyId = ptyId;

    return containerEl;
  }

  disposeLiveTerminal(flowId) {
    this._disposeTerminalEntry(this._liveTerminals, flowId);
  }

  // === Inline Log Terminal (expanded card) ===

  async loadLogIntoContainer(flowId, run, containerEl) {
    const log = run.logTimestamp
      ? await flowApi.getRunLog(flowId, run.logTimestamp)
      : null;

    const { term } = this._createAndRegister(
      this._logTerminals, flowId, containerEl,
      { scrollback: LOG_SCROLLBACK },
    );

    term.write(log || NO_LOG_MESSAGE);
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
    const log = await flowApi.getRunLog(flow.id, run.logTimestamp);

    const close = () => { resizeObs.disconnect(); term.dispose(); overlay.remove(); };
    const { overlay, modal } = createModalOverlay('flow-modal-overlay', 'flow-log-modal', close);
    const termContainer = _el('div', 'flow-log-terminal');
    modal.append(this._buildLogModalHeader(flow, run), termContainer);
    document.body.appendChild(overlay);

    const { term, resizeObs } = createPtyBoundTerminal(termContainer, {
      termOpts: { scrollback: LOG_SCROLLBACK },
      fitDelay: FLOW_FIT_DELAY_MS,
    });

    term.write(log || NO_LOG_MODAL_MESSAGE);

    modal.querySelector('.flow-log-close').addEventListener('click', close);
    onKeyAction(overlay, { onEscape: close });
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
