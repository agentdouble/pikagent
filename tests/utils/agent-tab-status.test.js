import { describe, expect, it, vi } from 'vitest';
import {
  AgentTabStatusTracker,
  summarizeTabAgentStatus,
} from '../../src/utils/agent-tab-status.js';
import { DATA_VOLUME_THRESHOLD } from '../../src/utils/board-helpers.js';

function buildTabs(termId = 'term-1') {
  const tab = {
    id: 'tab-1',
    agentStatuses: new Map(),
    terminalPanel: { terminals: new Map([[termId, {}]]) },
  };
  return { tab, tabs: new Map([[tab.id, tab]]) };
}

describe('agent-tab-status', () => {
  it('summarizes waiting agents before running agents', () => {
    const tab = {
      agentStatuses: new Map([
        ['term-1', { agent: 'Claude', status: 'running' }],
        ['term-2', { agent: 'Codex', status: 'waiting' }],
      ]),
    };

    expect(summarizeTabAgentStatus(tab)).toEqual({
      status: 'waiting',
      className: 'tab-agent-indicator tab-agent-waiting',
      title: 'Codex waiting for input',
    });
  });

  it('does not render a tab indicator while agents are still running', () => {
    const tab = {
      agentStatuses: new Map([
        ['term-1', { agent: 'Claude', status: 'running' }],
      ]),
    };

    expect(summarizeTabAgentStatus(tab)).toBe(null);
  });

  it('tracks running and waiting states from terminal data volume', async () => {
    const { tab, tabs } = buildTabs();
    let agents = { 'term-1': 'Claude' };
    let onData = null;
    const unsub = vi.fn();
    const renderTabBar = vi.fn();
    const tracker = new AgentTabStatusTracker({
      tabs,
      ptyCheckAgents: vi.fn(async () => agents),
      ptyOnData: vi.fn((_termId, cb) => {
        onData = cb;
        return unsub;
      }),
      renderTabBar,
    });

    await tracker.pollOnce();
    expect(tab.agentStatuses.get('term-1')).toEqual({ agent: 'Claude', status: 'running' });

    await tracker.pollOnce();
    expect(tab.agentStatuses.get('term-1')).toEqual({ agent: 'Claude', status: 'waiting' });

    onData('x'.repeat(DATA_VOLUME_THRESHOLD));
    await tracker.pollOnce();
    expect(tab.agentStatuses.get('term-1')).toEqual({ agent: 'Claude', status: 'running' });

    agents = {};
    await tracker.pollOnce();
    expect(tab.agentStatuses.has('term-1')).toBe(false);
    expect(unsub).toHaveBeenCalledTimes(1);
    expect(renderTabBar).toHaveBeenCalledTimes(4);
  });
});
