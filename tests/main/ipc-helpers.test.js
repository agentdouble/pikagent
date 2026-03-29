import { describe, it, expect, vi } from 'vitest';
const { safeSend, FORWARD_TABLE, SPREAD_TABLE } = require('../../main/ipc-helpers');

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
});
