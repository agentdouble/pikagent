import { describe, it, expect } from 'vitest';
const { MAX_FILE_SIZE, safeAsync, dirFirstCompare } = require('../../main/fs-manager-helpers');

describe('fs-manager-helpers', () => {
  describe('MAX_FILE_SIZE', () => {
    it('equals 2MB', () => {
      expect(MAX_FILE_SIZE).toBe(2 * 1024 * 1024);
    });
  });

  describe('safeAsync', () => {
    it('returns the result on success', async () => {
      const result = await safeAsync(async () => ({ value: 42 }));
      expect(result).toEqual({ value: 42 });
    });

    it('returns { error } on throw', async () => {
      const result = await safeAsync(async () => { throw new Error('boom'); });
      expect(result).toEqual({ error: 'boom' });
    });
  });

  describe('dirFirstCompare', () => {
    const dir = (name) => ({ name, isDirectory: () => true });
    const file = (name) => ({ name, isDirectory: () => false });

    it('sorts directories before files', () => {
      expect(dirFirstCompare(dir('b'), file('a'))).toBe(-1);
      expect(dirFirstCompare(file('a'), dir('b'))).toBe(1);
    });

    it('sorts alphabetically within same type', () => {
      expect(dirFirstCompare(dir('a'), dir('b'))).toBeLessThan(0);
      expect(dirFirstCompare(file('z'), file('a'))).toBeGreaterThan(0);
    });

    it('returns 0 for identical entries', () => {
      expect(dirFirstCompare(file('x'), file('x'))).toBe(0);
    });
  });
});
