import { describe, it, expect, vi } from 'vitest';
const { createLogger, trySafe } = require('../../main/logger');

describe('createLogger', () => {
  it('returns an object with info, warn and error methods', () => {
    const log = createLogger('test');
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('prefixes messages with [module]', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log = createLogger('my-mod');
    log.warn('something broke', new Error('oops'));
    expect(spy).toHaveBeenCalledWith('[my-mod]', 'something broke', 'oops');
    spy.mockRestore();
  });

  it('handles non-Error second argument', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = createLogger('mod');
    log.error('fail', 'raw string');
    expect(spy).toHaveBeenCalledWith('[mod]', 'fail', 'raw string');
    spy.mockRestore();
  });

  it('handles missing second argument', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = createLogger('mod');
    log.info('hello');
    expect(spy).toHaveBeenCalledWith('[mod]', 'hello', '');
    spy.mockRestore();
  });
});

describe('trySafe', () => {
  it('returns the result of fn on success', async () => {
    const result = await trySafe(() => 42, -1);
    expect(result).toBe(42);
  });

  it('returns defaultValue when fn throws', async () => {
    const result = await trySafe(() => { throw new Error('boom'); }, []);
    expect(result).toEqual([]);
  });

  it('works with async functions', async () => {
    const result = await trySafe(async () => 'ok', 'fail');
    expect(result).toBe('ok');
  });

  it('logs warning when logger and label are provided', async () => {
    const log = { warn: vi.fn() };
    await trySafe(() => { throw new Error('boom'); }, null, { log, label: 'op' });
    expect(log.warn).toHaveBeenCalledWith('op failed', expect.any(Error));
  });

  it('does not log when no opts provided', async () => {
    // Should not throw even without opts
    const result = await trySafe(() => { throw new Error('boom'); }, 'default');
    expect(result).toBe('default');
  });
});
