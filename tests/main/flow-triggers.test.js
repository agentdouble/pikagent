import { describe, it, expect } from 'vitest';
const path = require('path');
const {
  isHookFlow,
  flowMatchesHookEvent,
  debounceKey,
} = require('../../main/flow-triggers');

describe('flow-triggers', () => {
  it('detects hook flows from triggerType or hookTrigger', () => {
    expect(isHookFlow({ triggerType: 'hook' })).toBe(true);
    expect(isHookFlow({ hookTrigger: { event: 'file.changed' } })).toBe(true);
    expect(isHookFlow({ triggerType: 'schedule' })).toBe(false);
  });

  it('matches event, provider, cwd and glob paths', () => {
    const flow = {
      id: 'flow_1',
      enabled: true,
      cwd: '/repo',
      triggerType: 'hook',
      hookTrigger: {
        type: 'hook',
        event: 'file.changed',
        provider: 'watcher',
        paths: ['src/**/*.js'],
      },
    };

    expect(flowMatchesHookEvent(flow, {
      type: 'file.changed',
      provider: 'watcher',
      cwd: '/repo/app',
      paths: ['src/components/flow-view.js'],
    })).toBe(true);
  });

  it('rejects disabled flows and provider mismatches', () => {
    const flow = {
      id: 'flow_1',
      enabled: true,
      triggerType: 'hook',
      hookTrigger: { type: 'hook', event: 'file.changed', provider: 'codex' },
    };

    expect(flowMatchesHookEvent(flow, { type: 'file.changed', provider: 'watcher' })).toBe(false);
    expect(flowMatchesHookEvent({ ...flow, enabled: false }, { type: 'file.changed', provider: 'codex' })).toBe(false);
  });

  it('builds stable debounce keys per flow/event/provider/cwd', () => {
    expect(debounceKey(
      { id: 'flow_1' },
      { type: 'file.changed', provider: 'watcher', cwd: '/repo' },
    )).toBe(`flow_1|file.changed|watcher|${path.resolve('/repo')}`);
  });
});
