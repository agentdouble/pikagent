import { describe, it, expect } from 'vitest';
const {
  newTokenTotals,
  addTokens,
  parseTokenUsage,
  parseHumanTokenCount,
  parseTextTokenUsageSessions,
  buildTokenSessionRankings,
  getFlowRuns,
  accumulatePerDay,
  rankModifiedFiles,
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

  describe('parseHumanTokenCount', () => {
    it('parses token counts with narrow non-breaking spaces', () => {
      expect(parseHumanTokenCount('79\u202f462')).toBe(79462);
    });

    it('parses token counts with commas', () => {
      expect(parseHumanTokenCount('tokens used: 12,345')).toBe(12345);
    });
  });

  describe('parseTextTokenUsageSessions', () => {
    it('parses codex token summaries and carries the session id', () => {
      const sessions = parseTextTokenUsageSessions([
        'session id: 019f0112-a7c0-7150-834c-b857a605527b',
        'work output',
        'tokens used',
        '51\u202f835',
      ].join('\n'), {
        label: 'software engineering / Journey generator',
        source: 'Boucles',
        consumerKey: 'loop:main:node-18',
        logFile: '/tmp/node-18.log',
      });

      expect(sessions).toEqual([{
        sessionId: '019f0112-a7c0-7150-834c-b857a605527b',
        total: 51835,
        label: 'software engineering / Journey generator',
        source: 'Boucles',
        consumerKey: 'loop:main:node-18',
        logFile: '/tmp/node-18.log',
        runIndex: 1,
      }]);
    });

    it('parses token counts written on the same line', () => {
      const sessions = parseTextTokenUsageSessions('tokens used: 12,345', { label: 'Flow / A' });
      expect(sessions[0].total).toBe(12345);
      expect(sessions[0].label).toBe('Flow / A');
    });
  });

  describe('buildTokenSessionRankings', () => {
    it('ranks individual sessions and aggregates consumers', () => {
      const rankings = buildTokenSessionRankings([
        { sessionId: 'a', consumerKey: 'loop:1', label: 'Codeur', source: 'Boucles', total: 100 },
        { sessionId: 'b', consumerKey: 'loop:2', label: 'Reviewer', source: 'Boucles', total: 300 },
        { sessionId: 'c', consumerKey: 'loop:1', label: 'Codeur', source: 'Boucles', total: 250 },
      ]);

      expect(rankings.sessionTotal).toBe(650);
      expect(rankings.sessionCount).toBe(3);
      expect(rankings.perTokenSession.map((item) => item.sessionId)).toEqual(['b', 'c', 'a']);
      expect(rankings.perTokenConsumer[0]).toMatchObject({
        consumerKey: 'loop:1',
        label: 'Codeur',
        runs: 2,
        total: 350,
      });
    });

    it('deduplicates copied session output and prefers agent nodes', () => {
      const rankings = buildTokenSessionRankings([
        {
          sessionId: 'same-session',
          consumerKey: 'loop:watcher',
          label: 'Watcher reviewer',
          source: 'Boucles',
          consumerType: 'executable',
          total: 900,
        },
        {
          sessionId: 'same-session',
          consumerKey: 'loop:reviewer',
          label: 'Reviewer',
          source: 'Boucles',
          consumerType: 'agent',
          total: 900,
        },
      ]);

      expect(rankings.sessionCount).toBe(1);
      expect(rankings.sessionTotal).toBe(900);
      expect(rankings.perTokenSession[0]).toMatchObject({
        sessionId: 'same-session',
        consumerKey: 'loop:reviewer',
        label: 'Reviewer',
      });
      expect(rankings.perTokenConsumer).toHaveLength(1);
      expect(rankings.perTokenConsumer[0].consumerKey).toBe('loop:reviewer');
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

  describe('accumulatePerDay', () => {
    it('accumulates input/output per dateKey', () => {
      const map = {};
      accumulatePerDay(map, { dateKey: '2025-03-15', input: 100, output: 50 });
      accumulatePerDay(map, { dateKey: '2025-03-15', input: 200, output: 30 });
      expect(map['2025-03-15']).toEqual({ input: 300, output: 80 });
    });

    it('creates separate entries per date', () => {
      const map = {};
      accumulatePerDay(map, { dateKey: '2025-03-15', input: 10, output: 5 });
      accumulatePerDay(map, { dateKey: '2025-03-16', input: 20, output: 10 });
      expect(Object.keys(map)).toHaveLength(2);
    });

    it('does nothing when dateKey is null', () => {
      const map = {};
      accumulatePerDay(map, { dateKey: null, input: 100, output: 50 });
      expect(Object.keys(map)).toHaveLength(0);
    });
  });

  describe('rankModifiedFiles', () => {
    it('counts and ranks files by frequency', () => {
      const results = [
        { cwd: '/home/user/proj', files: ['a.js', 'b.js', 'a.js'] },
        { cwd: '/home/user/proj', files: ['a.js'] },
      ];
      const ranked = rankModifiedFiles(results, 10);
      expect(ranked[0].file).toBe('user/proj/a.js');
      expect(ranked[0].count).toBe(3);
      expect(ranked[1].file).toBe('user/proj/b.js');
      expect(ranked[1].count).toBe(1);
    });

    it('respects the limit parameter', () => {
      const results = [
        { cwd: '/home/user/proj', files: ['a.js', 'b.js', 'c.js'] },
      ];
      const ranked = rankModifiedFiles(results, 2);
      expect(ranked).toHaveLength(2);
    });

    it('returns empty array for empty input', () => {
      expect(rankModifiedFiles([], 10)).toEqual([]);
    });
  });
});
