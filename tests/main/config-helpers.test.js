import { describe, it, expect } from 'vitest';
const { DEFAULT_META, sanitizeName, buildConfigRecord, formatConfigList } = require('../../main/config-helpers');

describe('config-helpers', () => {
  describe('sanitizeName', () => {
    it('keeps alphanumeric, dash, underscore and space', () => {
      expect(sanitizeName('my-config_1 test')).toBe('my-config_1 test');
    });

    it('replaces special characters with underscore', () => {
      expect(sanitizeName('foo/bar:baz!')).toBe('foo_bar_baz_');
    });

    it('truncates to 64 characters', () => {
      const long = 'a'.repeat(100);
      expect(sanitizeName(long)).toHaveLength(64);
    });
  });

  describe('buildConfigRecord', () => {
    it('creates a new record with createdAt = now', () => {
      const record = buildConfigRecord('test', { tabs: [1] }, null, '2025-01-01');
      expect(record).toEqual({
        tabs: [1],
        name: 'test',
        createdAt: '2025-01-01',
        updatedAt: '2025-01-01',
      });
    });

    it('preserves createdAt from existing record', () => {
      const existing = { createdAt: '2024-06-01' };
      const record = buildConfigRecord('test', { tabs: [] }, existing, '2025-01-01');
      expect(record.createdAt).toBe('2024-06-01');
      expect(record.updatedAt).toBe('2025-01-01');
    });
  });

  describe('formatConfigList', () => {
    it('filters out __autosave__ and marks default', () => {
      const configs = [
        { name: '__autosave__', tabs: [1, 2], updatedAt: 'x' },
        { name: 'workspace-1', tabs: [1], updatedAt: '2025-01-01' },
        { name: 'workspace-2', tabs: [1, 2, 3], updatedAt: '2025-02-01' },
      ];
      const result = formatConfigList(configs, 'workspace-2');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: 'workspace-1',
        updatedAt: '2025-01-01',
        tabCount: 1,
        isDefault: false,
      });
      expect(result[1].isDefault).toBe(true);
    });

    it('returns empty array for empty input', () => {
      expect(formatConfigList([], null)).toEqual([]);
    });
  });

  describe('DEFAULT_META', () => {
    it('has null defaultConfig', () => {
      expect(DEFAULT_META).toEqual({ defaultConfig: null });
    });
  });
});
