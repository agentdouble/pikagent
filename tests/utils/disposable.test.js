import { describe, it, expect, vi } from 'vitest';
import { disposeResources } from '../../src/utils/disposable.js';

describe('disposeResources', () => {
  it('calls dispose() on resources with action "dispose"', () => {
    const obj = { dispose: vi.fn() };
    disposeResources([{ ref: { res: obj }, key: 'res', action: 'dispose' }]);
    expect(obj.dispose).toHaveBeenCalledOnce();
  });

  it('calls disconnect() on resources with action "disconnect"', () => {
    const obs = { disconnect: vi.fn() };
    const ref = { observer: obs };
    disposeResources([{ ref, key: 'observer', action: 'disconnect' }]);
    expect(obs.disconnect).toHaveBeenCalledOnce();
  });

  it('calls the function for action "call"', () => {
    const fn = vi.fn();
    const ref = { unsub: fn };
    disposeResources([{ ref, key: 'unsub', action: 'call' }]);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('calls remove() on resources with action "remove"', () => {
    const el = { remove: vi.fn() };
    const ref = { el };
    disposeResources([{ ref, key: 'el', action: 'remove' }]);
    expect(el.remove).toHaveBeenCalledOnce();
  });

  it('calls clearInterval for action "clearInterval"', () => {
    const originalClearInterval = globalThis.clearInterval;
    const mockClear = vi.fn();
    globalThis.clearInterval = mockClear;
    const ref = { timer: 42 };
    try {
      disposeResources([{ ref, key: 'timer', action: 'clearInterval' }]);
      expect(mockClear).toHaveBeenCalledWith(42);
    } finally {
      globalThis.clearInterval = originalClearInterval;
    }
  });

  it('nullifies the reference after cleanup', () => {
    const obj = { dispose: vi.fn() };
    const ref = { res: obj };
    disposeResources([{ ref, key: 'res', action: 'dispose' }]);
    expect(ref.res).toBeNull();
  });

  it('skips entries where the value is already null', () => {
    const ref = { res: null };
    expect(() => disposeResources([{ ref, key: 'res', action: 'dispose' }])).not.toThrow();
  });

  it('skips entries where the value is undefined', () => {
    const ref = {};
    expect(() => disposeResources([{ ref, key: 'res', action: 'dispose' }])).not.toThrow();
  });

  it('processes multiple resources in order', () => {
    const order = [];
    const a = { dispose: vi.fn(() => order.push('a')) };
    const b = { dispose: vi.fn(() => order.push('b')) };
    const ref = { a, b };
    disposeResources([
      { ref, key: 'a', action: 'dispose' },
      { ref, key: 'b', action: 'dispose' },
    ]);
    expect(order).toEqual(['a', 'b']);
    expect(ref.a).toBeNull();
    expect(ref.b).toBeNull();
  });

  it('handles an empty resource list without error', () => {
    expect(() => disposeResources([])).not.toThrow();
  });
});
