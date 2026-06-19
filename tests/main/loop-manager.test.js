import { describe, expect, it } from 'vitest';

const { _internals } = require('../../main/loop-manager');

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
});
