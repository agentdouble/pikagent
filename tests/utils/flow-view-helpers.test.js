import { describe, it, expect } from 'vitest';
import {
  getLastRun,
  buildDotTooltip,
  getFlowsForCategory,
  getUncategorizedFlows,
  removeFlowFromOrder,
  moveFlowInOrder,
  deleteCategoryData,
  UNCATEGORIZED,
} from '../../src/utils/flow-view-helpers.js';

describe('flow-view-helpers', () => {
  describe('getLastRun', () => {
    it('returns last run from array', () => {
      const flow = { runs: [{ id: 1 }, { id: 2 }, { id: 3 }] };
      expect(getLastRun(flow)).toEqual({ id: 3 });
    });

    it('returns null when no runs', () => {
      expect(getLastRun({})).toBe(null);
      expect(getLastRun({ runs: [] })).toBe(null);
    });

    it('returns single run when only one', () => {
      const flow = { runs: [{ id: 1 }] };
      expect(getLastRun(flow)).toEqual({ id: 1 });
    });
  });

  describe('getFlowsForCategory', () => {
    it('returns flows in category order', () => {
      const flows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const order = { cat1: ['c', 'a'] };
      expect(getFlowsForCategory(flows, order, 'cat1')).toEqual([{ id: 'c' }, { id: 'a' }]);
    });

    it('returns empty for unknown category', () => {
      expect(getFlowsForCategory([{ id: 'a' }], {}, 'unknown')).toEqual([]);
    });
  });

  describe('removeFlowFromOrder', () => {
    it('removes flow from all categories', () => {
      const order = { cat1: ['a', 'b'], cat2: ['b', 'c'] };
      removeFlowFromOrder(order, 'b');
      expect(order).toEqual({ cat1: ['a'], cat2: ['c'] });
    });
  });

  describe('moveFlowInOrder', () => {
    it('moves flow to target category', () => {
      const order = { cat1: ['a', 'b'], cat2: ['c'] };
      moveFlowInOrder(order, 'b', 'cat2', 0);
      expect(order.cat1).toEqual(['a']);
      expect(order.cat2).toEqual(['b', 'c']);
    });

    it('appends when insertIndex is -1', () => {
      const order = { cat1: ['a'] };
      moveFlowInOrder(order, 'b', 'cat1');
      expect(order.cat1).toEqual(['a', 'b']);
    });
  });

  describe('deleteCategoryData', () => {
    it('moves flows to uncategorized and removes category', () => {
      const catData = {
        categories: [{ id: 'cat1', name: 'Test' }],
        order: { cat1: ['a', 'b'] },
      };
      expect(deleteCategoryData(catData, 'cat1')).toBe(true);
      expect(catData.categories).toEqual([]);
      expect(catData.order[UNCATEGORIZED]).toEqual(['a', 'b']);
    });

    it('returns false for unknown category', () => {
      const catData = { categories: [], order: {} };
      expect(deleteCategoryData(catData, 'unknown')).toBe(false);
    });
  });
});
