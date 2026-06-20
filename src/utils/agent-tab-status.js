import { DATA_VOLUME_THRESHOLD, POLL_INTERVAL_MS, resolveCardStatus } from './board-helpers.js';
import { findTabForTerminal } from './tab-lifecycle.js';
import { RendererPollingTimer } from './polling.js';

export const TAB_AGENT_STATUS = {
  waiting: {
    className: 'tab-agent-waiting',
    title: 'waiting for input',
  },
};

function ensureAgentStatuses(tab) {
  if (!(tab.agentStatuses instanceof Map)) tab.agentStatuses = new Map();
  return tab.agentStatuses;
}

export function setTabAgentStatus(tab, termId, status) {
  if (!tab || !termId || !status) return false;
  const statuses = ensureAgentStatuses(tab);
  const previous = statuses.get(termId);
  if (previous?.agent === status.agent && previous?.status === status.status) return false;
  statuses.set(termId, {
    agent: status.agent || 'Agent',
    status: status.status,
  });
  return true;
}

export function removeTabAgentStatus(tab, termId) {
  if (!(tab?.agentStatuses instanceof Map)) return false;
  return tab.agentStatuses.delete(termId);
}

export function getTabAgentStatuses(tab) {
  if (!(tab?.agentStatuses instanceof Map)) return [];
  return [...tab.agentStatuses.values()];
}

function summarizeEntries(entries) {
  if (entries.length === 0) return null;
  const waiting = entries.filter((entry) => entry.status === 'waiting');
  if (waiting.length === 0) return null;

  const label = waiting.length === 1
    ? waiting[0].agent || 'Agent'
    : `${waiting.length} agents`;
  return {
    status: 'waiting',
    className: `tab-agent-indicator ${TAB_AGENT_STATUS.waiting.className}`,
    title: `${label} ${TAB_AGENT_STATUS.waiting.title}`,
  };
}

export function summarizeTabAgentStatus(tab) {
  return summarizeEntries(getTabAgentStatuses(tab));
}

export class AgentTabStatusTracker {
  constructor({ tabs, ptyCheckAgents, ptyOnData, renderTabBar, pollMs = POLL_INTERVAL_MS }) {
    this.tabs = tabs;
    this.ptyCheckAgents = ptyCheckAgents;
    this.ptyOnData = ptyOnData;
    this.renderTabBar = renderTabBar;
    this.disposed = false;
    this._polling = false;
    this._terms = new Map();
    this._pollTimer = new RendererPollingTimer(pollMs, () => this.pollOnce());
  }

  start() {
    this._pollTimer.start();
  }

  dispose() {
    this.disposed = true;
    this._pollTimer.stop();
    for (const termId of [...this._terms.keys()]) this._removeTrackedTerm(termId);
  }

  async pollOnce() {
    if (this.disposed || this._polling) return;
    this._polling = true;
    try {
      const scanChanged = await this._scanAgents();
      const statusChanged = this._refreshActivityStatuses();
      if (scanChanged || statusChanged) this.renderTabBar();
    } catch (error) {
      console.warn('Agent tab status scan failed:', error);
    } finally {
      this._polling = false;
    }
  }

  async _scanAgents() {
    const agents = await this.ptyCheckAgents();
    if (this.disposed) return false;
    return this._syncAgentScan(agents || {});
  }

  _syncAgentScan(agents) {
    let changed = false;
    const activeTermIds = new Set(Object.keys(agents));

    for (const termId of [...this._terms.keys()]) {
      if (!activeTermIds.has(termId)) changed = this._removeTrackedTerm(termId) || changed;
    }

    for (const [termId, agent] of Object.entries(agents)) {
      changed = this._ensureTrackedTerm(termId, agent) || changed;
    }

    return changed;
  }

  _ensureTrackedTerm(termId, agent) {
    let data = this._terms.get(termId);
    let changed = false;

    if (!data) {
      data = {
        agent,
        status: 'running',
        dataBytes: DATA_VOLUME_THRESHOLD,
        tabId: null,
        unsubData: null,
      };
      this._terms.set(termId, data);
      data.unsubData = this.ptyOnData(termId, (chunk) => this._recordData(termId, chunk));
      changed = true;
    } else if (data.agent !== agent) {
      data.agent = agent;
      changed = true;
    }

    return this._writeStatusToOwningTab(termId, data) || changed;
  }

  _recordData(termId, chunk) {
    const data = this._terms.get(termId);
    if (!data) return;
    data.dataBytes += String(chunk || '').length;
  }

  _refreshActivityStatuses() {
    let changed = false;
    for (const [termId, data] of this._terms) {
      const nextStatus = resolveCardStatus(data.dataBytes);
      data.dataBytes = 0;
      if (data.status !== nextStatus) {
        data.status = nextStatus;
        changed = this._writeStatusToOwningTab(termId, data) || changed;
      }
    }
    return changed;
  }

  _writeStatusToOwningTab(termId, data) {
    const match = findTabForTerminal(this.tabs, termId);
    let changed = false;

    if (!match) {
      if (data.tabId) {
        changed = removeTabAgentStatus(this.tabs.get(data.tabId), termId) || changed;
        data.tabId = null;
      }
      return changed;
    }

    if (data.tabId && data.tabId !== match.tabId) {
      changed = removeTabAgentStatus(this.tabs.get(data.tabId), termId) || changed;
    }
    data.tabId = match.tabId;
    return setTabAgentStatus(match.tab, termId, {
      agent: data.agent,
      status: data.status,
    }) || changed;
  }

  _removeTrackedTerm(termId) {
    const data = this._terms.get(termId);
    if (!data) return false;

    data.unsubData?.();
    const changed = data.tabId
      ? removeTabAgentStatus(this.tabs.get(data.tabId), termId)
      : false;
    this._terms.delete(termId);
    return changed;
  }
}
