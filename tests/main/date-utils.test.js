import { describe, it, expect } from 'vitest';
const { extractDateString, generateDateRange } = require('../../main/date-utils');
const { formatDateTime } = require('../../shared/date-utils');

describe('date-utils', () => {
  describe('extractDateString', () => {
    it('extracts YYYY-MM-DD from ISO string', () => {
      expect(extractDateString('2025-03-15T10:30:00.000Z')).toBe('2025-03-15');
    });

    it('returns null for null input', () => {
      expect(extractDateString(null)).toBe(null);
    });

    it('returns null for empty string', () => {
      expect(extractDateString('')).toBe(null);
    });

    it('handles date-only strings', () => {
      expect(extractDateString('2025-12-31')).toBe('2025-12-31');
    });
  });

  describe('generateDateRange', () => {
    it('returns array of N days ending today', () => {
      const range = generateDateRange(7);
      expect(range).toHaveLength(7);
      const today = new Date().toISOString().slice(0, 10);
      expect(range[6].date).toBe(today);
    });

    it('defaults to 30 days', () => {
      const range = generateDateRange();
      expect(range).toHaveLength(30);
    });

    it('each entry has date and label properties', () => {
      const range = generateDateRange(1);
      expect(range[0]).toHaveProperty('date');
      expect(range[0]).toHaveProperty('label');
      expect(typeof range[0].date).toBe('string');
      expect(typeof range[0].label).toBe('string');
    });

    it('dates are in chronological order', () => {
      const range = generateDateRange(3);
      expect(range[0].date < range[1].date).toBe(true);
      expect(range[1].date < range[2].date).toBe(true);
    });
  });

  describe('formatDateTime', () => {
    it('returns date with time when timestamp provided', () => {
      const ts = new Date('2025-03-15T14:32:00Z').getTime();
      const result = formatDateTime('2025-03-15', ts);
      expect(result).toMatch(/^2025-03-15 .+/);
    });

    it('returns date only when no timestamp', () => {
      expect(formatDateTime('2025-03-15', null)).toBe('2025-03-15');
      expect(formatDateTime('2025-03-15', 0)).toBe('2025-03-15');
    });
  });
});
