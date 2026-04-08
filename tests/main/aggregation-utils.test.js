import { describe, it, expect } from 'vitest';
const { computeRate } = require('../../main/aggregation-utils');

describe('aggregation-utils', () => {
  describe('computeRate', () => {
    const categories = {
      success: new Set(['success', 'completed']),
      error: new Set(['error', 'exited']),
    };

    it('computes counts and rate from items', () => {
      const items = [
        { status: 'success' },
        { status: 'completed' },
        { status: 'error' },
        { status: 'exited' },
      ];
      const result = computeRate(items, categories);
      expect(result.total).toBe(4);
      expect(result.success).toBe(2);
      expect(result.error).toBe(2);
      expect(result.rate).toBe(50);
    });

    it('returns 0 rate for empty input', () => {
      const result = computeRate([], categories);
      expect(result).toEqual({ total: 0, success: 0, error: 0, rate: 0 });
    });

    it('uses custom field parameter', () => {
      const items = [{ result: 'success' }, { result: 'error' }];
      const result = computeRate(items, categories, 'result');
      expect(result.total).toBe(2);
      expect(result.success).toBe(1);
      expect(result.error).toBe(1);
      expect(result.rate).toBe(50);
    });

    it('uses custom rateKey parameter', () => {
      const items = [
        { status: 'success' },
        { status: 'error' },
        { status: 'error' },
      ];
      const result = computeRate(items, categories, 'status', 'error');
      expect(result.total).toBe(3);
      expect(result.success).toBe(1);
      expect(result.error).toBe(2);
      expect(result.rate).toBe(67);
    });

    it('handles unknown rateKey gracefully', () => {
      const items = [{ status: 'success' }];
      const result = computeRate(items, categories, 'status', 'unknown');
      expect(result.rate).toBe(0);
    });
  });
});
