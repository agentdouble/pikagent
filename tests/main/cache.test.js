import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
const { Cache, cachedAsync } = require('../../main/cache');

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

describe('cachedAsync', () => {
  it('calls fn on first invocation and caches result', async () => {
    const cache = new Cache();
    const fn = vi.fn().mockResolvedValue({ data: 42 });
    const wrapped = cachedAsync(cache, fn);

    const result = await wrapped();
    expect(result).toEqual({ data: 42 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns cached value on subsequent calls without calling fn', async () => {
    const cache = new Cache();
    const fn = vi.fn().mockResolvedValue('expensive');
    const wrapped = cachedAsync(cache, fn);

    await wrapped();
    const result = await wrapped();
    expect(result).toBe('expensive');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('recomputes after cache expires (TTL)', async () => {
    vi.useFakeTimers();
    const cache = new Cache(500);
    let counter = 0;
    const fn = vi.fn().mockImplementation(async () => ++counter);
    const wrapped = cachedAsync(cache, fn);

    expect(await wrapped()).toBe(1);
    vi.advanceTimersByTime(500);
    expect(await wrapped()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('recomputes after cache.clear()', async () => {
    const cache = new Cache();
    let counter = 0;
    const fn = vi.fn().mockImplementation(async () => ++counter);
    const wrapped = cachedAsync(cache, fn);

    expect(await wrapped()).toBe(1);
    cache.clear();
    expect(await wrapped()).toBe(2);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
