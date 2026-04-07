import { describe, it, expect, vi } from 'vitest';
const { safeSend, FORWARD_TABLE, SPREAD_TABLE, registerManagerHandlers } = require('../../main/ipc-helpers');

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

  describe('FORWARD_TABLE', () => {
    it('is an array of [channel, targetKey, method] tuples', () => {
      expect(FORWARD_TABLE.length).toBeGreaterThan(0);
      for (const entry of FORWARD_TABLE) {
        expect(entry).toHaveLength(3);
        expect(typeof entry[0]).toBe('string');
        expect(typeof entry[1]).toBe('string');
        expect(typeof entry[2]).toBe('string');
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
  });

  describe('SPREAD_TABLE', () => {
    it('is an array of [channel, targetKey, method, keys] tuples', () => {
      expect(SPREAD_TABLE.length).toBeGreaterThan(0);
      for (const entry of SPREAD_TABLE) {
        expect(entry).toHaveLength(4);
        expect(typeof entry[0]).toBe('string');
        expect(typeof entry[1]).toBe('string');
        expect(typeof entry[2]).toBe('string');
        expect(Array.isArray(entry[3])).toBe(true);
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
      for (const [, , , keys] of SPREAD_TABLE) {
        expect(keys.length).toBeGreaterThan(0);
        for (const k of keys) {
          expect(typeof k).toBe('string');
        }
      }
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

      const targets = {
        pty: { checkAgents: myMethod },
        fs: { readDirectory: myMethod, readFile: myMethod, makeDir: myMethod, getHomedir: myMethod, copyEntry: myMethod, writeFile: mySpreadMethod, renameEntry: mySpreadMethod, copyFileTo: mySpreadMethod, unwatchDir: mySpreadMethod },
        git: { getBranch: myMethod, getRemoteUrl: myMethod, getLocalChanges: myMethod, getFileDiff: mySpreadMethod },
        config: { load: myMethod, list: myMethod, remove: myMethod, setDefault: myMethod, getDefault: myMethod, loadDefault: myMethod, save: mySpreadMethod },
        flow: { save: myMethod, get: myMethod, list: myMethod, remove: myMethod, toggleEnabled: myMethod, runNow: myMethod, getRunning: myMethod, getCategories: myMethod, saveCategories: myMethod, getRunLog: mySpreadMethod },
        usage: { getMetrics: myMethod },
        shell: { showItemInFolder: myMethod, openExternal: myMethod, openPath: myMethod },
        clipboard: { writeText: myMethod },
      };

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
});
