import { describe, it, expect } from 'vitest';
const {
  newTokenTotals,
  addTokens,
  parseLogTimestamp,
  parseTokenUsage,
  projectShortName,
  getFlowRuns,
  getFlowRunDuration,
} = require('../../main/usage-helpers');

describe('usage-helpers', () => {
  describe('newTokenTotals', () => {
    it('returns zeroed token object', () => {
      expect(newTokenTotals()).toEqual({ input: 0, output: 0, cacheRead: 0, cacheCreate: 0 });
    });
  });

  describe('addTokens', () => {
    it('adds source tokens to target', () => {
      const target = newTokenTotals();
      addTokens(target, { input: 100, output: 50, cacheRead: 10, cacheCreate: 5 });
      expect(target).toEqual({ input: 100, output: 50, cacheRead: 10, cacheCreate: 5 });
    });

    it('handles missing keys in source', () => {
      const target = { input: 10, output: 10, cacheRead: 10, cacheCreate: 10 };
      addTokens(target, {});
      expect(target).toEqual({ input: 10, output: 10, cacheRead: 10, cacheCreate: 10 });
    });
  });

  describe('parseLogTimestamp', () => {
    it('parses custom log timestamp format', () => {
      const ts = '2025-03-15T10-30-00-123';
      const date = parseLogTimestamp(ts);
      expect(date).toBeInstanceOf(Date);
      expect(date.getFullYear()).toBe(2025);
    });

    it('returns null for invalid format', () => {
      expect(parseLogTimestamp('invalid')).toBe(null);
    });
  });

  describe('parseTokenUsage', () => {
    it('parses a valid assistant message with usage', () => {
      const line = JSON.stringify({
        type: 'assistant',
        timestamp: Date.now(),
        message: {
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 10,
            cache_creation_input_tokens: 5,
          },
        },
      });
      const result = parseTokenUsage(line, 0);
      expect(result.input).toBe(100);
      expect(result.output).toBe(50);
      expect(result.cacheRead).toBe(10);
      expect(result.cacheCreate).toBe(5);
    });

    it('returns null for non-assistant messages', () => {
      const line = JSON.stringify({ type: 'user', message: { usage: {} } });
      expect(parseTokenUsage(line, 0)).toBe(null);
    });

    it('returns null for lines without "usage"', () => {
      expect(parseTokenUsage('{"type":"assistant"}', 0)).toBe(null);
    });

    it('returns null when timestamp is before cutoff', () => {
      const old = Date.now() - 100000;
      const line = JSON.stringify({
        type: 'assistant',
        timestamp: old,
        message: { usage: { input_tokens: 10, output_tokens: 5 } },
      });
      expect(parseTokenUsage(line, Date.now())).toBe(null);
    });
  });

  describe('projectShortName', () => {
    it('returns last 2 parts for long project names', () => {
      expect(projectShortName('-Users-rekta-projet-coding')).toBe('projet/coding');
    });

    it('returns full name for short project names', () => {
      expect(projectShortName('-test')).toBe('test');
    });
  });

  describe('getFlowRuns', () => {
    it('flattens flow runs with flow metadata', () => {
      const flows = [
        { id: 'f1', name: 'Flow 1', cwd: '/tmp', runs: [{ status: 'success' }] },
        { id: 'f2', name: 'Flow 2', runs: [{ status: 'error' }] },
      ];
      const runs = getFlowRuns(flows);
      expect(runs).toHaveLength(2);
      expect(runs[0].flowId).toBe('f1');
      expect(runs[0].flowName).toBe('Flow 1');
      expect(runs[0].cwd).toBe('/tmp');
    });

    it('skips flows without runs', () => {
      expect(getFlowRuns([{ id: 'f1', name: 'F' }])).toEqual([]);
    });
  });

  describe('getFlowRunDuration', () => {
    it('computes duration in seconds', () => {
      const run = {
        logTimestamp: '2025-03-15T10-30-00-000',
        timestamp: '2025-03-15T10:30:45.000Z',
      };
      const dur = getFlowRunDuration(run);
      expect(dur).toBeGreaterThan(0);
      expect(typeof dur).toBe('number');
    });

    it('returns null for missing timestamps', () => {
      expect(getFlowRunDuration({})).toBe(null);
      expect(getFlowRunDuration({ logTimestamp: 'x' })).toBe(null);
    });
  });
});
