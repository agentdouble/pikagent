import { describe, expect, it } from 'vitest';

const { _internals } = require('../../main/loop-manager');
const { linkedAgentNodes, shouldTriggerLinkedTargets } = require('../../main/loop-link-helpers');
const { activeLoopNodeRun } = require('../../main/loop-run-state');

describe('loop-manager', () => {
  it('normalizes unsupported nodes away and drops edges pointing to them', () => {
    const loop = _internals.normalizeLoop({
      id: 'main',
      name: '',
      nodes: [
        { id: 'agent-1', type: 'agent', title: '', agent: 'unknown', x: '12', y: '18' },
        { id: 'bad-1', type: 'unknown', title: 'Bad' },
      ],
      edges: [
        { id: 'edge-1', from: 'agent-1', to: 'bad-1' },
        { id: 'edge-2', from: 'agent-1', to: 'agent-1' },
      ],
    });

    expect(loop.name).toBe('Boucles');
    expect(loop.nodes).toHaveLength(1);
    expect(loop.nodes[0]).toMatchObject({
      id: 'agent-1',
      type: 'agent',
      title: 'Agent',
      agent: 'codex',
      x: 12,
      y: 18,
      enabled: true,
      triggerType: 'schedule',
    });
    expect(loop.edges).toEqual([{ id: 'edge-2', from: 'agent-1', to: 'agent-1' }]);
  });

  it('builds executable node commands directly', () => {
    const command = _internals.buildNodeCommand({
      id: 'exec-1',
      type: 'executable',
      title: 'Watcher',
      command: 'npm test',
    });

    expect(command).toBe('npm test');
  });

  it('builds agent node commands through the flow command builder', () => {
    const command = _internals.buildNodeCommand({
      id: 'agent-1',
      type: 'agent',
      title: 'Coder',
      agent: 'codex',
      prompt: 'fix it',
      dangerouslySkipPermissions: true,
      schedule: { type: 'weekdays', time: '09:00' },
      enabled: true,
    });

    expect(command).toContain('codex');
    expect(command).toContain('--sandbox danger-full-access');
    expect(command).toContain('fix it');
  });

  it('keeps node process identities scoped by board', () => {
    expect(_internals.runningKey('main', 'node-1')).toBe('main::node-1');
    expect(_internals.runningKey('board-2', 'node-1')).toBe('board-2::node-1');
  });

  it('normalizes legacy node args to the main board', () => {
    expect(_internals.normalizeNodeArg('node-1')).toEqual({
      boardId: 'main',
      nodeId: 'node-1',
    });
    expect(_internals.normalizeNodeArg({ boardId: 'board-2', nodeId: 'node-1' })).toEqual({
      boardId: 'board-2',
      nodeId: 'node-1',
    });
  });

  it('keeps link-triggered agents out of schedule and hook config', () => {
    const node = _internals.normalizeNode({
      id: 'agent-link',
      type: 'agent',
      title: 'Linked',
      triggerType: 'link',
      hookTrigger: { event: 'task.ready' },
    }, new Date().toISOString());

    expect(node.triggerType).toBe('link');
    expect(node.hookTrigger).toBeUndefined();
  });

  it('selects downstream link-triggered agent nodes only once', () => {
    const loop = {
      nodes: [
        { id: 'source', type: 'executable', enabled: true },
        { id: 'linked', type: 'agent', triggerType: 'link', enabled: true },
        { id: 'scheduled', type: 'agent', triggerType: 'schedule', enabled: true },
        { id: 'disabled', type: 'agent', triggerType: 'link', enabled: false },
        { id: 'file', type: 'display' },
      ],
      edges: [
        { id: 'e1', from: 'source', to: 'linked' },
        { id: 'e2', from: 'source', to: 'linked' },
        { id: 'e3', from: 'source', to: 'scheduled' },
        { id: 'e4', from: 'source', to: 'disabled' },
        { id: 'e5', from: 'source', to: 'file' },
      ],
    };

    expect(linkedAgentNodes(loop, 'source').map((node) => node.id)).toEqual(['linked']);
    expect(linkedAgentNodes(loop, 'source', new Set(['linked']))).toEqual([]);
  });

  it('only triggers linked targets after a clean exit', () => {
    expect(shouldTriggerLinkedTargets(0, null)).toBe(true);
    expect(shouldTriggerLinkedTargets(1, null)).toBe(false);
    expect(shouldTriggerLinkedTargets(0, 'SIGTERM')).toBe(false);
  });

  it('treats persisted hook loop runs as active only while the pid is alive', () => {
    const run = { status: 'running', pid: 1234 };

    expect(activeLoopNodeRun(run, { isAlive: () => true })).toBe(run);
    expect(activeLoopNodeRun(run, { isAlive: () => false })).toBe(null);
    expect(activeLoopNodeRun({ status: 'success', pid: 1234 }, { isAlive: () => true })).toBe(null);
  });
});
