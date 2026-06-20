import { describe, it, expect, vi, beforeEach } from 'vitest';
import { persistedSetting } from '../../src/utils/persisted-setting.js';

describe('persistedSetting', () => {
  let store;

  beforeEach(() => {
    store = {};
    globalThis.localStorage = {
      getItem: vi.fn((k) => (k in store ? store[k] : null)),
      setItem: vi.fn((k, v) => { store[k] = String(v); }),
    };
  });

  it('returns default value when key is missing', () => {
    const setting = persistedSetting('missing-key', 'fallback');
    expect(setting.get()).toBe('fallback');
  });

  it('returns stored value when key exists', () => {
    store['my-key'] = 'stored';
    const setting = persistedSetting('my-key', 'fallback');
    expect(setting.get()).toBe('stored');
  });

  it('persists value via set()', () => {
    const setting = persistedSetting('my-key', 'fallback');
    setting.set('new-value');
    expect(localStorage.setItem).toHaveBeenCalledWith('my-key', 'new-value');
    expect(setting.get()).toBe('new-value');
  });

  it('returns default when getItem throws', () => {
    localStorage.getItem = vi.fn(() => { throw new Error('SecurityError'); });
    const setting = persistedSetting('key', 'safe');
    expect(setting.get()).toBe('safe');
  });

  it('swallows errors from setItem', () => {
    localStorage.setItem = vi.fn(() => { throw new Error('QuotaExceeded'); });
    const setting = persistedSetting('key', 'val');
    expect(() => setting.set('x')).not.toThrow();
  });
});
