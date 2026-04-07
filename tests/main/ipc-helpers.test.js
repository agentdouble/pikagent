import { describe, it, expect, vi } from 'vitest';
const { safeSend, FORWARD_TABLE, SPREAD_TABLE, buildTablesFromSchema, registerForward, registerSpread, registerManagerHandlers } = require('../../main/ipc-helpers');
const { API_SCHEMA } = require('../../api-schema');

describe('ipc-helpers', () => {
  describe('safeSend', () => {
    it('sends payload when window is available', () => {
      const send = vi.fn();
      const getWindow = () => ({ isDestroyed: () => false, webContents: { send } });
      safeSend(getWindow, 'test:channel', { data: 1 });
      expect(send).toHaveBeenCalledWith('test:channel', { data: 1 });
    });

    it('does nothing when window is null', () => {
      const getWindow = () => null;
      expect(() => safeSend(getWindow, 'ch', {})).not.toThrow();
    });

    it('does nothing when window is destroyed', () => {
      const send = vi.fn();
      const getWindow = () => ({ isDestroyed: () => true, webContents: { send } });
      safeSend(getWindow, 'ch', {});
      expect(send).not.toHaveBeenCalled();
    });
  });

  describe('buildTablesFromSchema', () => {
    it('derives tables from a minimal schema', () => {
      const schema = {
        test: {
          foo: { type: 'fwd' },
          bar: { type: 'pack', keys: ['a', 'b'] },
          baz: { type: 'on', channel: 'test:bazEvent' },
        },
      };
      const { forward, spread } = buildTablesFromSchema(schema);
      expect(forward).toEqual([['test:foo', 'test']]);
      expect(spread).toEqual([['test:bar', 'test', ['a', 'b']]]);
      // 'on' entries are renderer-only, not in either table
    });

    it('uses explicit channel when provided', () => {
      const schema = { x: { y: { type: 'fwd', channel: 'custom:ch' } } };
      const { forward } = buildTablesFromSchema(schema);
      expect(forward[0][0]).toBe('custom:ch');
    });
  });

  describe('FORWARD_TABLE (derived from API_SCHEMA)', () => {
    it('is an array of [channel, domain] tuples', () => {
      expect(FORWARD_TABLE.length).toBeGreaterThan(0);
      for (const entry of FORWARD_TABLE) {
        expect(entry).toHaveLength(2);
        expect(typeof entry[0]).toBe('string');  // channel
        expect(typeof entry[1]).toBe('string');  // domain
      }
    });

    it('has unique channel names', () => {
      const channels = FORWARD_TABLE.map(([ch]) => ch);
      expect(new Set(channels).size).toBe(channels.length);
    });

    it('contains expected channels', () => {
      const channels = FORWARD_TABLE.map(([ch]) => ch);
      expect(channels).toContain('pty:checkAgents');
      expect(channels).toContain('fs:readdir');
      expect(channels).toContain('git:branch');
      expect(channels).toContain('config:load');
      expect(channels).toContain('flow:save');
      expect(channels).toContain('usage:getMetrics');
    });

    it('matches all fwd entries from API_SCHEMA', () => {
      let expectedCount = 0;
      for (const methods of Object.values(API_SCHEMA)) {
        for (const def of Object.values(methods)) {
          if (def.type === 'fwd') expectedCount++;
        }
      }
      expect(FORWARD_TABLE.length).toBe(expectedCount);
    });
  });

  describe('SPREAD_TABLE (derived from API_SCHEMA)', () => {
    it('is an array of [channel, domain, keys] tuples', () => {
      expect(SPREAD_TABLE.length).toBeGreaterThan(0);
      for (const entry of SPREAD_TABLE) {
        expect(entry).toHaveLength(3);
        expect(typeof entry[0]).toBe('string');     // channel
        expect(typeof entry[1]).toBe('string');     // domain
        expect(Array.isArray(entry[2])).toBe(true); // keys
      }
    });

    it('has unique channel names', () => {
      const channels = SPREAD_TABLE.map(([ch]) => ch);
      expect(new Set(channels).size).toBe(channels.length);
    });

    it('has no overlap with FORWARD_TABLE channels', () => {
      const forwardChannels = new Set(FORWARD_TABLE.map(([ch]) => ch));
      for (const [ch] of SPREAD_TABLE) {
        expect(forwardChannels.has(ch)).toBe(false);
      }
    });

    it('spread keys are non-empty string arrays', () => {
      for (const [, , keys] of SPREAD_TABLE) {
        expect(keys.length).toBeGreaterThan(0);
        for (const k of keys) {
          expect(typeof k).toBe('string');
        }
      }
    });

    it('matches all pack entries from API_SCHEMA', () => {
      let expectedCount = 0;
      for (const methods of Object.values(API_SCHEMA)) {
        for (const def of Object.values(methods)) {
          if (def.type === 'pack') expectedCount++;
        }
      }
      expect(SPREAD_TABLE.length).toBe(expectedCount);
    });
  });

  describe('registerManagerHandlers', () => {
    it('registers forward and spread handlers from tables', () => {
      const handlers = {};
      const ipc = {
        handle: vi.fn((channel, handler) => { handlers[channel] = handler; }),
      };

      const myMethod = vi.fn((arg) => `result:${arg}`);
      const mySpreadMethod = vi.fn((a, b) => `${a}+${b}`);

      // Build targets with method names matching channel suffixes (domain:method -> method)
      const targets = {};
      for (const [channel, domain] of FORWARD_TABLE) {
        if (!targets[domain]) targets[domain] = {};
        const method = channel.split(':')[1];
        targets[domain][method] = myMethod;
      }
      for (const [channel, domain] of SPREAD_TABLE) {
        if (!targets[domain]) targets[domain] = {};
        const method = channel.split(':')[1];
        targets[domain][method] = mySpreadMethod;
      }

      registerManagerHandlers(ipc, targets);

      // Should register all channels from both tables
      const totalExpected = FORWARD_TABLE.length + SPREAD_TABLE.length;
      expect(ipc.handle).toHaveBeenCalledTimes(totalExpected);

      // Verify a forward handler works
      const forwardResult = handlers['fs:readdir'](null, '/some/path');
      expect(myMethod).toHaveBeenCalledWith('/some/path');

      // Verify a spread handler works
      handlers['config:save'](null, { name: 'test', data: {} });
      expect(mySpreadMethod).toHaveBeenCalledWith('test', {});
    });

    it('skips targets not in the map', () => {
      const ipc = { handle: vi.fn() };
      registerManagerHandlers(ipc, {});
      expect(ipc.handle).not.toHaveBeenCalled();
    });
  });

  describe('registerForward', () => {
    it('registers ipc handlers that forward a single arg to target methods', async () => {
      const handlers = {};
      const ipc = { handle: vi.fn((channel, fn) => { handlers[channel] = fn; }) };
      const target = { doSomething: vi.fn().mockReturnValue('ok') };

      registerForward(ipc, target, [['test:forward', 'doSomething']]);

      expect(ipc.handle).toHaveBeenCalledWith('test:forward', expect.any(Function));
      const result = await handlers['test:forward']({}, { foo: 1 });
      expect(target.doSomething).toHaveBeenCalledWith({ foo: 1 });
      expect(result).toBe('ok');
    });

    it('registers multiple channels at once', () => {
      const ipc = { handle: vi.fn() };
      const target = { a: vi.fn(), b: vi.fn() };

      registerForward(ipc, target, [
        ['ch:a', 'a'],
        ['ch:b', 'b'],
      ]);

      expect(ipc.handle).toHaveBeenCalledTimes(2);
      const channels = ipc.handle.mock.calls.map(([ch]) => ch);
      expect(channels).toContain('ch:a');
      expect(channels).toContain('ch:b');
    });

    it('works with expected forward-style channels like pty:checkAgents and fs:readdir', async () => {
      const handlers = {};
      const ipc = { handle: vi.fn((channel, fn) => { handlers[channel] = fn; }) };
      const target = {
        checkAgents: vi.fn().mockReturnValue(['agent1']),
        readDirectory: vi.fn().mockReturnValue([]),
      };

      registerForward(ipc, target, [
        ['pty:checkAgents', 'checkAgents'],
        ['fs:readdir', 'readDirectory'],
      ]);

      const agents = await handlers['pty:checkAgents']({}, '/some/path');
      expect(target.checkAgents).toHaveBeenCalledWith('/some/path');
      expect(agents).toEqual(['agent1']);

      const entries = await handlers['fs:readdir']({}, '/tmp');
      expect(target.readDirectory).toHaveBeenCalledWith('/tmp');
      expect(entries).toEqual([]);
    });
  });

  describe('registerSpread', () => {
    it('registers ipc handlers that spread keyed args to target methods', async () => {
      const handlers = {};
      const ipc = { handle: vi.fn((channel, fn) => { handlers[channel] = fn; }) };
      const target = { write: vi.fn().mockReturnValue(true) };

      registerSpread(ipc, target, [['pty:write', 'write', ['id', 'data']]]);

      expect(ipc.handle).toHaveBeenCalledWith('pty:write', expect.any(Function));
      const result = await handlers['pty:write']({}, { id: 'term-1', data: 'hello' });
      expect(target.write).toHaveBeenCalledWith('term-1', 'hello');
      expect(result).toBe(true);
    });

    it('registers multiple channels at once', () => {
      const ipc = { handle: vi.fn() };
      const target = { write: vi.fn(), resize: vi.fn() };

      registerSpread(ipc, target, [
        ['pty:write', 'write', ['id', 'data']],
        ['pty:resize', 'resize', ['id', 'cols', 'rows']],
      ]);

      expect(ipc.handle).toHaveBeenCalledTimes(2);
      const channels = ipc.handle.mock.calls.map(([ch]) => ch);
      expect(channels).toContain('pty:write');
      expect(channels).toContain('pty:resize');
    });

    it('spreads keys in correct order for multi-arg calls', async () => {
      const handlers = {};
      const ipc = { handle: vi.fn((channel, fn) => { handlers[channel] = fn; }) };
      const target = { resize: vi.fn() };

      registerSpread(ipc, target, [['pty:resize', 'resize', ['id', 'cols', 'rows']]]);

      await handlers['pty:resize']({}, { id: 'term-1', cols: 80, rows: 24 });
      expect(target.resize).toHaveBeenCalledWith('term-1', 80, 24);
    });

    it('has no overlap between forward and spread channel patterns', () => {
      // Verify the registration functions handle their respective channel types correctly
      const forwardHandlers = {};
      const spreadHandlers = {};
      const forwardIpc = { handle: vi.fn((ch, fn) => { forwardHandlers[ch] = fn; }) };
      const spreadIpc = { handle: vi.fn((ch, fn) => { spreadHandlers[ch] = fn; }) };
      const target = { a: vi.fn(), b: vi.fn() };

      registerForward(forwardIpc, target, [['shared:test', 'a']]);
      registerSpread(spreadIpc, target, [['spread:test', 'b', ['key1']]]);

      const forwardChannels = new Set(Object.keys(forwardHandlers));
      const spreadChannels = new Set(Object.keys(spreadHandlers));
      for (const ch of spreadChannels) {
        expect(forwardChannels.has(ch)).toBe(false);
      }
    });
  });
});
