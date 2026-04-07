import { describe, it, expect } from 'vitest';
const { aggregateByKey, groupAndAggregate, computeRate } = require('../../main/aggregation-utils');

describe('aggregation-utils', () => {
  describe('aggregateByKey', () => {
    it('accumulates values into buckets keyed by keyFn', () => {
      const items = [
        { cat: 'a', val: 1 },
        { cat: 'b', val: 2 },
        { cat: 'a', val: 3 },
      ];
      const result = aggregateByKey(
        items,
        (item) => item.cat,
        () => ({ sum: 0 }),
        (bucket, item) => { bucket.sum += item.val; },
      );
      expect(result).toEqual({ a: { sum: 4 }, b: { sum: 2 } });
    });

    it('skips items with null/undefined keys', () => {
      const items = [{ cat: null, val: 1 }, { cat: 'a', val: 2 }];
      const result = aggregateByKey(
        items,
        (item) => item.cat,
        () => ({ count: 0 }),
        (bucket) => { bucket.count++; },
      );
      expect(result).toEqual({ a: { count: 1 } });
    });

    it('returns empty object for empty input', () => {
      const result = aggregateByKey([], () => 'k', () => ({}), () => {});
      expect(result).toEqual({});
    });
  });

  describe('groupAndAggregate', () => {
    it('groups items by key then applies aggregation', () => {
      const items = [
        { type: 'x', val: 10 },
        { type: 'y', val: 20 },
        { type: 'x', val: 30 },
      ];
      const result = groupAndAggregate(
        items,
        (item) => item.type,
        (group) => group.reduce((sum, i) => sum + i.val, 0),
      );
      expect(result).toEqual({ x: 40, y: 20 });
    });

    it('skips items with null/undefined keys', () => {
      const items = [{ type: null, val: 1 }, { type: 'a', val: 2 }];
      const result = groupAndAggregate(
        items,
        (item) => item.type,
        (group) => group.length,
      );
      expect(result).toEqual({ a: 1 });
    });

    it('returns empty object for empty input', () => {
      const result = groupAndAggregate([], () => 'k', () => 0);
      expect(result).toEqual({});
    });
  });

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
