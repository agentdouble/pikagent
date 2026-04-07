import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const { Cache } = require('../../main/cache');

describe('Cache', () => {
  describe('without TTL', () => {
    it('returns null when empty', () => {
      const cache = new Cache();
      expect(cache.get()).toBeNull();
    });

    it('stores and retrieves a value', () => {
      const cache = new Cache();
      cache.set({ foo: 'bar' });
      expect(cache.get()).toEqual({ foo: 'bar' });
    });

    it('overwrites previous value', () => {
      const cache = new Cache();
      cache.set('first');
      cache.set('second');
      expect(cache.get()).toBe('second');
    });

    it('clear resets to null', () => {
      const cache = new Cache();
      cache.set('value');
      cache.clear();
      expect(cache.get()).toBeNull();
    });

    it('never expires without TTL', () => {
      vi.useFakeTimers();
      const cache = new Cache();
      cache.set('value');
      vi.advanceTimersByTime(999999999);
      expect(cache.get()).toBe('value');
      vi.useRealTimers();
    });
  });

  describe('with TTL', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('returns value before TTL expires', () => {
      const cache = new Cache(1000);
      cache.set('value');
      vi.advanceTimersByTime(999);
      expect(cache.get()).toBe('value');
    });

    it('returns null after TTL expires', () => {
      const cache = new Cache(1000);
      cache.set('value');
      vi.advanceTimersByTime(1000);
      expect(cache.get()).toBeNull();
    });

    it('refreshes TTL on set', () => {
      const cache = new Cache(1000);
      cache.set('first');
      vi.advanceTimersByTime(800);
      cache.set('second');
      vi.advanceTimersByTime(800);
      expect(cache.get()).toBe('second');
    });
  });
});
