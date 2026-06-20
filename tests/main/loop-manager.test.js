import { describe, expect, it } from 'vitest';

const { LoopManager, _internals } = require('../../main/loop-manager');
const {
  isLinkTriggeredNode,
  linkedAgentNodes,
  linkedRunnableNodes,
  shouldTriggerLinkedTargets,
} = require('../../main/loop-link-helpers');
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
      model: 'gpt-5.5',
      reasoningEffort: 'xhigh',
      prompt: 'fix it',
      dangerouslySkipPermissions: true,
      schedule: { type: 'weekdays', time: '09:00' },
      enabled: true,
    });

    expect(command).toContain('codex');
    expect(command).toContain("--model 'gpt-5.5'");
    expect(command).toContain("-c 'model_reasoning_effort=\"xhigh\"'");
    expect(command).toContain('--sandbox danger-full-access');
    expect(command).toContain('fix it');
  });

  it('normalizes agent model settings on loop nodes', () => {
    const node = _internals.normalizeNode({
      id: 'agent-model',
      type: 'agent',
      title: 'Model Agent',
      agent: 'codex',
      model: ' gpt-5.4 ',
      reasoningEffort: 'HIGH',
    }, new Date().toISOString());

    expect(node.model).toBe('gpt-5.4');
    expect(node.reasoningEffort).toBe('high');
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

  it('normalizes board ids for board-level actions', () => {
    expect(_internals.normalizeBoardIdArg('board-1')).toBe('board-1');
    expect(_internals.normalizeBoardIdArg({ boardId: 'board-2' })).toBe('board-2');
    expect(_internals.normalizeBoardIdArg('../bad')).toBe('main');
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

  it('selects pipeline starters without link-triggered agents or visual nodes', () => {
    const loop = {
      nodes: [
        { id: 'exec', type: 'executable', enabled: true },
        { id: 'agent-schedule', type: 'agent', triggerType: 'schedule', enabled: true },
        { id: 'agent-hook', type: 'agent', triggerType: 'hook', enabled: true },
        { id: 'agent-link', type: 'agent', triggerType: 'link', enabled: true },
        { id: 'disabled', type: 'executable', enabled: false },
        { id: 'display', type: 'display', enabled: true },
      ],
    };

    expect(_internals.pipelineStarterNodes(loop).map((node) => node.id)).toEqual([
      'exec',
      'agent-schedule',
      'agent-hook',
    ]);
  });

  it('selects only enabled executable nodes for executable-only runs', () => {
    const loop = {
      nodes: [
        { id: 'exec-root', type: 'executable', enabled: true },
        { id: 'exec-linked', type: 'executable', enabled: true },
        { id: 'agent', type: 'agent', triggerType: 'schedule', enabled: true },
        { id: 'disabled-exec', type: 'executable', enabled: false },
        { id: 'file', type: 'display', enabled: true },
      ],
      edges: [
        { id: 'edge-1', from: 'exec-root', to: 'exec-linked' },
      ],
    };

    expect(_internals.executableNodes(loop).map((node) => node.id)).toEqual([
      'exec-root',
      'exec-linked',
    ]);
  });

  it('runs only executable nodes without following links', async () => {
    const manager = new LoopManager();
    manager.get = async () => ({
      nodes: [
        { id: 'exec-idle', type: 'executable', enabled: true },
        { id: 'exec-running', type: 'executable', enabled: true },
        { id: 'agent', type: 'agent', triggerType: 'schedule', enabled: true },
        { id: 'disabled-exec', type: 'executable', enabled: false },
        { id: 'file', type: 'display' },
      ],
    });
    manager._isNodeRunning = async (_boardId, nodeId) => nodeId === 'exec-running';
    const runCalls = [];
    manager.runNode = async (arg, context) => {
      runCalls.push({ arg, context });
      return { nodeId: arg.nodeId, status: 'running' };
    };

    const result = await manager.runExecutables({ boardId: 'board-1' });

    expect(runCalls).toEqual([
      {
        arg: { boardId: 'board-1', nodeId: 'exec-idle' },
        context: { trigger: 'executables', followLinks: false },
      },
    ]);
    expect(result.started.map((item) => item.nodeId)).toEqual(['exec-idle']);
    expect(result.skipped).toEqual([{ nodeId: 'exec-running', reason: 'running' }]);
  });

  it('treats disabled runnable nodes as stoppable when they are already running', () => {
    expect(_internals.isRunnableNode({ type: 'executable', enabled: false })).toBe(false);
    expect(_internals.isStoppableNode({ type: 'executable', enabled: false })).toBe(true);
    expect(_internals.isStoppableNode({ type: 'agent', enabled: false })).toBe(true);
    expect(_internals.isStoppableNode({ type: 'display' })).toBe(false);
  });

  it('stops every running pipeline job on a board', async () => {
    const manager = new LoopManager();
    manager.get = async () => ({
      nodes: [
        { id: 'exec-running', type: 'executable', enabled: true },
        { id: 'agent-running', type: 'agent', enabled: false },
        { id: 'exec-idle', type: 'executable', enabled: true },
        { id: 'file', type: 'display' },
      ],
    });
    manager._isNodeRunning = async (_boardId, nodeId) =>
      nodeId === 'exec-running' || nodeId === 'agent-running';
    const stoppedArgs = [];
    manager.stopNode = async (arg) => {
      stoppedArgs.push(arg);
      return { nodeId: arg.nodeId, status: 'stopped' };
    };

    const result = await manager.stopPipeline({ boardId: 'board-1' });

    expect(stoppedArgs).toEqual([
      { boardId: 'board-1', nodeId: 'exec-running' },
      { boardId: 'board-1', nodeId: 'agent-running' },
    ]);
    expect(result.stopped.map((item) => item.nodeId)).toEqual(['exec-running', 'agent-running']);
    expect(result.skipped).toEqual([{ nodeId: 'exec-idle', reason: 'not-running' }]);
  });

  it('uses directed links to keep downstream executables out of pipeline starters', () => {
    const loop = {
      nodes: [
        { id: 'source', type: 'executable', enabled: true },
        { id: 'exec-target', type: 'executable', enabled: true },
        { id: 'agent-target', type: 'agent', triggerType: 'link', enabled: true },
        { id: 'scheduled-agent', type: 'agent', triggerType: 'schedule', enabled: true },
      ],
      edges: [
        { id: 'edge-1', from: 'source', to: 'exec-target' },
        { id: 'edge-2', from: 'source', to: 'agent-target' },
        { id: 'edge-3', from: 'source', to: 'scheduled-agent' },
      ],
    };

    expect(_internals.incomingLinkTargetIds(loop)).toEqual(new Set(['exec-target', 'agent-target']));
    expect(_internals.pipelineStarterNodes(loop).map((node) => node.id)).toEqual([
      'source',
      'scheduled-agent',
    ]);
  });

  it('selects downstream link-triggered runnable nodes only once', () => {
    const loop = {
      nodes: [
        { id: 'source', type: 'executable', enabled: true },
        { id: 'linked', type: 'agent', triggerType: 'link', enabled: true },
        { id: 'exec', type: 'executable', enabled: true },
        { id: 'scheduled', type: 'agent', triggerType: 'schedule', enabled: true },
        { id: 'disabled', type: 'agent', triggerType: 'link', enabled: false },
        { id: 'file', type: 'display' },
      ],
      edges: [
        { id: 'e1', from: 'source', to: 'linked' },
        { id: 'e2', from: 'source', to: 'linked' },
        { id: 'e3', from: 'source', to: 'exec' },
        { id: 'e4', from: 'source', to: 'scheduled' },
        { id: 'e5', from: 'source', to: 'disabled' },
        { id: 'e6', from: 'source', to: 'file' },
      ],
    };

    expect(isLinkTriggeredNode(loop.nodes[1])).toBe(true);
    expect(isLinkTriggeredNode(loop.nodes[2])).toBe(true);
    expect(isLinkTriggeredNode(loop.nodes[3])).toBe(false);
    expect(linkedRunnableNodes(loop, 'source').map((node) => node.id)).toEqual(['linked', 'exec']);
    expect(linkedRunnableNodes(loop, 'source', new Set(['linked', 'exec']))).toEqual([]);
    expect(linkedAgentNodes(loop, 'source').map((node) => node.id)).toEqual(['linked']);
    expect(linkedAgentNodes(loop, 'source', new Set(['linked']))).toEqual([]);
  });

  it('only triggers linked targets after a clean exit', () => {
    expect(shouldTriggerLinkedTargets(0, null)).toBe(true);
    expect(shouldTriggerLinkedTargets(1, null)).toBe(false);
    expect(shouldTriggerLinkedTargets(0, 'SIGTERM')).toBe(false);
  });

  it('records loop run close statuses consistently', () => {
    expect(_internals.loopRunStatusFromClose(0, null)).toBe('success');
    expect(_internals.loopRunStatusFromClose(1, null)).toBe('error');
    expect(_internals.loopRunStatusFromClose(null, 'SIGTERM')).toBe('stopped');
  });

  it('treats persisted hook loop runs as active only while the pid is alive', () => {
    const run = { status: 'running', pid: 1234 };

    expect(activeLoopNodeRun(run, { isAlive: () => true })).toBe(run);
    expect(activeLoopNodeRun(run, { isAlive: () => false })).toBe(null);
    expect(activeLoopNodeRun({ status: 'success', pid: 1234 }, { isAlive: () => true })).toBe(null);
  });
});
