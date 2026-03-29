import { describe, it, expect, vi } from 'vitest';
const { generateSessionId, durationSec, isFlowTerminal, buildEndedRecord, buildActiveRecord, trimSessions, MAX_SESSIONS } = require('../../main/session-helpers');

describe('session-helpers', () => {
  describe('generateSessionId', () => {
    it('starts with "session-"', () => {
      expect(generateSessionId()).toMatch(/^session-\d+-[a-z0-9]+$/);
    });

    it('generates unique ids', () => {
      const a = generateSessionId();
      const b = generateSessionId();
      expect(a).not.toBe(b);
    });
  });

  describe('durationSec', () => {
    it('computes seconds since startedAt', () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const startedAt = new Date(now - 5000).toISOString();
      expect(durationSec(startedAt)).toBe(5);
      vi.useRealTimers();
    });
  });

  describe('isFlowTerminal', () => {
    it('returns true for flow- prefix', () => {
      expect(isFlowTerminal('flow-abc-123')).toBe(true);
    });

    it('returns false for regular terminal ids', () => {
      expect(isFlowTerminal('term-1')).toBe(false);
    });
  });

  describe('buildEndedRecord', () => {
    it('adds endedAt, durationSec and status', () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const session = { id: 's1', startedAt: new Date(now - 10000).toISOString() };
      const result = buildEndedRecord(session, 'completed');
      expect(result.status).toBe('completed');
      expect(result.durationSec).toBe(10);
      expect(result.endedAt).toBeDefined();
      vi.useRealTimers();
    });
  });

  describe('buildActiveRecord', () => {
    it('sets status to running', () => {
      const now = Date.now();
      vi.setSystemTime(now);
      const session = { id: 's1', startedAt: new Date(now - 3000).toISOString() };
      const result = buildActiveRecord(session);
      expect(result.status).toBe('running');
      expect(result.durationSec).toBe(3);
      vi.useRealTimers();
    });
  });

  describe('trimSessions', () => {
    it('keeps sessions under max', () => {
      const sessions = Array.from({ length: 10 }, (_, i) => ({ id: i }));
      expect(trimSessions(sessions)).toHaveLength(10);
    });

    it('trims to last max entries', () => {
      const sessions = Array.from({ length: 250 }, (_, i) => ({ id: i }));
      const trimmed = trimSessions(sessions);
      expect(trimmed).toHaveLength(MAX_SESSIONS);
      expect(trimmed[0].id).toBe(50); // 250 - 200 = 50
    });
  });
});
