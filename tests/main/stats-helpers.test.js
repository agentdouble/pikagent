import { describe, it, expect } from 'vitest';
const { countByStatus, computeRate, computeDuration, dateStr, dayLabels } = require('../../main/stats-helpers');

describe('stats-helpers', () => {
  describe('countByStatus', () => {
    it('counts success and error statuses', () => {
      const items = [
        { status: 'success' },
        { status: 'completed' },
        { status: 'error' },
        { status: 'exited' },
        { status: 'running' },
      ];
      expect(countByStatus(items)).toEqual({ success: 2, error: 2, running: 1 });
    });

    it('returns zeros for empty array', () => {
      expect(countByStatus([])).toEqual({ success: 0, error: 0, running: 0 });
    });
  });

  describe('computeRate', () => {
    it('computes success rate percentage', () => {
      const items = [
        { status: 'success' },
        { status: 'success' },
        { status: 'error' },
        { status: 'running' },
      ];
      const result = computeRate(items);
      expect(result.total).toBe(4);
      expect(result.success).toBe(2);
      expect(result.error).toBe(1);
      expect(result.rate).toBe(50);
    });

    it('returns 0 rate for empty array', () => {
      expect(computeRate([])).toEqual({ total: 0, success: 0, error: 0, rate: 0 });
    });
  });

  describe('computeDuration', () => {
    it('computes avg, min, max from durations', () => {
      const result = computeDuration([10, 20, 30]);
      expect(result.avg).toBe(20);
      expect(result.min).toBe(10);
      expect(result.max).toBe(30);
      expect(result.count).toBe(3);
    });

    it('filters out null/zero/negative values', () => {
      const result = computeDuration([null, 0, -5, 100]);
      expect(result.count).toBe(1);
      expect(result.avg).toBe(100);
    });

    it('returns zeros for empty input', () => {
      expect(computeDuration([])).toEqual({ avg: 0, min: 0, max: 0, count: 0 });
    });
  });

  describe('dateStr', () => {
    it('extracts YYYY-MM-DD from ISO string', () => {
      expect(dateStr('2025-03-15T10:30:00.000Z')).toBe('2025-03-15');
    });

    it('returns null for falsy input', () => {
      expect(dateStr(null)).toBe(null);
      expect(dateStr('')).toBe(null);
    });
  });

  describe('dayLabels', () => {
    it('returns array of N days ending today', () => {
      const labels = dayLabels(7);
      expect(labels).toHaveLength(7);
      expect(labels[6].date).toBe(new Date().toISOString().slice(0, 10));
    });

    it('each entry has date and label', () => {
      const labels = dayLabels(1);
      expect(labels[0]).toHaveProperty('date');
      expect(labels[0]).toHaveProperty('label');
    });
  });
});
