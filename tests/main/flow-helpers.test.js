import { describe, it, expect } from 'vitest';
const { shouldRun, buildFlowCommand } = require('../../main/flow-helpers');
const { getLastRun } = require('../../shared/flow-utils');

describe('flow-helpers', () => {
  describe('getLastRun (from shared/flow-utils)', () => {
    it('returns last run from array', () => {
      const flow = { runs: [{ id: 1 }, { id: 2 }] };
      expect(getLastRun(flow)).toEqual({ id: 2 });
    });

    it('returns null when no runs', () => {
      expect(getLastRun({})).toBe(null);
      expect(getLastRun({ runs: [] })).toBe(null);
    });
  });

  describe('shouldRun', () => {
    it('returns false without schedule', () => {
      expect(shouldRun({}, new Date())).toBe(false);
    });

    it('returns false for hook flows even when a schedule remains stored', () => {
      const flow = {
        triggerType: 'hook',
        hookTrigger: { type: 'hook', event: 'file.changed' },
        schedule: { type: 'interval', intervalHours: 1 },
      };
      expect(shouldRun(flow, new Date())).toBe(false);
    });

    describe('interval schedule', () => {
      it('returns true when no previous run', () => {
        const flow = { schedule: { type: 'interval', intervalHours: 1 } };
        expect(shouldRun(flow, new Date())).toBe(true);
      });

      it('returns true when interval elapsed', () => {
        const past = new Date(Date.now() - 2 * 3600000).toISOString();
        const flow = {
          schedule: { type: 'interval', intervalHours: 1 },
          runs: [{ timestamp: past }],
        };
        expect(shouldRun(flow, new Date())).toBe(true);
      });

      it('returns false when interval not elapsed', () => {
        const recent = new Date(Date.now() - 10 * 60000).toISOString(); // 10 min ago
        const flow = {
          schedule: { type: 'interval', intervalHours: 1 },
          runs: [{ timestamp: recent }],
        };
        expect(shouldRun(flow, new Date())).toBe(false);
      });
    });

    describe('daily schedule', () => {
      it('returns true at matching time with no previous run today', () => {
        const now = new Date('2025-06-15T09:00:30');
        const flow = { schedule: { type: 'daily', time: '09:00' } };
        expect(shouldRun(flow, now)).toBe(true);
      });

      it('returns false at non-matching time', () => {
        const now = new Date('2025-06-15T10:00:00');
        const flow = { schedule: { type: 'daily', time: '09:00' } };
        expect(shouldRun(flow, now)).toBe(false);
      });

      it('returns false if already ran today', () => {
        const now = new Date('2025-06-15T09:00:30');
        const flow = {
          schedule: { type: 'daily', time: '09:00' },
          runs: [{ date: '2025-06-15', timestamp: '2025-06-15T09:00:00Z' }],
        };
        expect(shouldRun(flow, now)).toBe(false);
      });
    });

    describe('weekdays schedule', () => {
      it('returns false on weekends', () => {
        // 2025-06-14 is a Saturday (day 6)
        const sat = new Date('2025-06-14T09:00:00');
        const flow = { schedule: { type: 'weekdays', time: '09:00' } };
        expect(shouldRun(flow, sat)).toBe(false);
      });
    });

    describe('custom schedule', () => {
      it('returns false on non-selected day', () => {
        // 2025-06-16 is Monday (day 1)
        const mon = new Date('2025-06-16T09:00:00');
        const flow = { schedule: { type: 'custom', time: '09:00', days: [3, 5] } };
        expect(shouldRun(flow, mon)).toBe(false);
      });
    });
  });

  describe('buildFlowCommand', () => {
    it('builds claude command by default', () => {
      const flow = { prompt: 'fix bugs', agent: 'claude' };
      const cmd = buildFlowCommand(flow);
      expect(cmd).toContain('claude');
      expect(cmd).toContain('fix bugs');
      expect(cmd).toContain('; exit\n');
    });

    it('builds codex command with workspace-write by default', () => {
      const flow = { prompt: 'test', agent: 'codex' };
      const cmd = buildFlowCommand(flow);
      expect(cmd).toContain('codex');
      expect(cmd).toContain('--sandbox workspace-write');
      expect(cmd).toContain('--ask-for-approval never');
      expect(cmd).toContain('exec --skip-git-repo-check');
    });

    it('builds codex command with danger-full-access when dangerouslySkipPermissions', () => {
      const flow = { prompt: 'test', agent: 'codex', dangerouslySkipPermissions: true };
      const cmd = buildFlowCommand(flow);
      expect(cmd).toContain('--sandbox danger-full-access');
    });

    it('builds codex command with model and reasoning effort overrides', () => {
      const flow = {
        prompt: 'test',
        agent: 'codex',
        model: 'gpt-5.5',
        reasoningEffort: 'high',
        serviceTier: 'fast',
      };
      const cmd = buildFlowCommand(flow);

      expect(cmd).toContain("--model 'gpt-5.5'");
      expect(cmd).toContain("-c 'model_reasoning_effort=\"high\"'");
      expect(cmd).toContain("-c 'service_tier=\"fast\"'");
      expect(cmd).toContain('exec --skip-git-repo-check');
    });

    it('builds codex command with standard service tier when fast is disabled', () => {
      const flow = {
        prompt: 'test',
        agent: 'codex',
        serviceTier: 'standard',
      };
      const cmd = buildFlowCommand(flow);

      expect(cmd).toContain("-c 'service_tier=\"standard\"'");
    });

    it('escapes single quotes in prompt', () => {
      const flow = { prompt: "it's a test", agent: 'claude' };
      const cmd = buildFlowCommand(flow);
      expect(cmd).toContain("it'\\''s a test");
    });

    it('builds PowerShell-compatible commands for Windows', () => {
      const flow = {
        prompt: "it's a test",
        agent: 'codex',
        model: 'gpt-5.5',
        reasoningEffort: 'high',
      };
      const cmd = buildFlowCommand(flow, { platform: 'win32' });

      expect(cmd).toContain("--model 'gpt-5.5'");
      expect(cmd).toContain("-c 'model_reasoning_effort=\"high\"'");
      expect(cmd).toContain("'it''s a test'");
      expect(cmd.endsWith('; exit\r\n')).toBe(true);
    });

    it('supports dangerouslySkipPermissions', () => {
      const flow = { prompt: 'fix', agent: 'claude', dangerouslySkipPermissions: true };
      const cmd = buildFlowCommand(flow);
      expect(cmd).toContain('--dangerously-skip-permissions');
    });
  });
});
