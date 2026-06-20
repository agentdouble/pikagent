import { afterEach, describe, expect, it } from 'vitest';
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  buildHookTargetCommand,
  listHookTargets,
  listLoopAgentTargets,
  loopNodeToHookTarget,
  targetMatches,
} = require('../../main/flow-hook-cli');
const { flowMatchesHookEvent } = require('../../main/flow-triggers');

const tempDirs = [];

async function makeTempDir() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pickagent-hooks-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fsp.rm(dir, { recursive: true, force: true })));
});

describe('flow-hook-cli', () => {
  it('discovers hook-triggered loop agent nodes as hook targets', async () => {
    const loopsDir = await makeTempDir();
    await fsp.writeFile(path.join(loopsDir, 'quality.json'), JSON.stringify({
      name: 'Quality',
      nodes: [
        {
          id: 'agent-1',
          type: 'agent',
          title: 'Review Agent',
          agent: 'codex',
          model: 'gpt-5.5',
          reasoningEffort: 'high',
          serviceTier: 'fast',
          cwd: '/repo',
          prompt: 'review the change',
          enabled: true,
          triggerType: 'hook',
          hookTrigger: {
            type: 'hook',
            event: 'file.changed',
            provider: 'codex',
            paths: ['src/**/*.js'],
          },
        },
        {
          id: 'agent-2',
          type: 'agent',
          title: 'Scheduled Agent',
          triggerType: 'schedule',
        },
        {
          id: 'agent-3',
          type: 'agent',
          title: 'Linked Agent',
          triggerType: 'link',
          hookTrigger: { type: 'hook', event: 'file.changed' },
        },
        {
          id: 'exec-1',
          type: 'executable',
          title: 'Executable Hook',
          hookTrigger: { type: 'hook', event: 'file.changed' },
        },
      ],
    }), 'utf-8');

    const targets = await listLoopAgentTargets(loopsDir);

    expect(targets).toHaveLength(1);
    expect(targets[0]).toMatchObject({
      id: 'loop:quality:agent-1',
      name: 'Quality / Review Agent',
      source: 'loop',
      boardId: 'quality',
      nodeId: 'agent-1',
      triggerType: 'hook',
      prompt: 'review the change',
      model: 'gpt-5.5',
      reasoningEffort: 'high',
      serviceTier: 'fast',
    });
    expect(flowMatchesHookEvent(targets[0], {
      type: 'file.changed',
      provider: 'codex',
      cwd: '/repo/app',
      paths: ['src/components/loop-view.js'],
    })).toBe(true);
    expect(targetMatches(targets[0], 'Review Agent')).toBe(true);
    expect(targetMatches(targets[0], 'Quality / Review Agent')).toBe(true);
  });

  it('lists regular flow hooks and loop agent hooks together', async () => {
    const root = await makeTempDir();
    const flowsDir = path.join(root, 'flows');
    const loopsDir = path.join(root, 'loops');
    await fsp.mkdir(flowsDir, { recursive: true });
    await fsp.mkdir(loopsDir, { recursive: true });
    await fsp.writeFile(path.join(flowsDir, 'flow-1.json'), JSON.stringify({
      id: 'flow-1',
      name: 'Flow Hook',
      prompt: 'run flow',
      enabled: true,
      triggerType: 'hook',
      hookTrigger: { type: 'hook', event: 'task.ready' },
    }), 'utf-8');
    await fsp.writeFile(path.join(loopsDir, 'main.json'), JSON.stringify({
      id: 'main',
      name: 'Boucles',
      nodes: [{
        id: 'agent-1',
        type: 'agent',
        title: 'Loop Hook',
        prompt: 'run loop agent',
        enabled: true,
        hookTrigger: { type: 'hook', event: 'task.ready' },
      }],
    }), 'utf-8');

    const targets = await listHookTargets({ flowsDir, loopsDir });

    expect(targets.map((target) => [target.id, target.source])).toEqual([
      ['flow-1', 'flow'],
      ['loop:main:agent-1', 'loop'],
    ]);
  });

  it('keeps stale hook data inactive on link-triggered loop targets', () => {
    const target = loopNodeToHookTarget(
      { id: 'main', name: 'Boucles' },
      {
        id: 'agent-link',
        type: 'agent',
        title: 'Linked',
        triggerType: 'link',
        hookTrigger: { type: 'hook', event: 'task.ready' },
      },
    );

    expect(target.triggerType).toBe('link');
    expect(target.hookTrigger).toBeUndefined();
  });

  it('builds executable loop target commands directly for linked pipeline targets', () => {
    const target = loopNodeToHookTarget(
      { id: 'main', name: 'Boucles' },
      {
        id: 'exec-1',
        type: 'executable',
        title: 'Watcher',
        command: 'npm test',
        cwd: '/repo',
        enabled: true,
      },
    );

    expect(target).toMatchObject({
      id: 'loop:main:exec-1',
      nodeType: 'executable',
      command: 'npm test',
    });
    expect(buildHookTargetCommand(target)).toBe('npm test');
  });
});
