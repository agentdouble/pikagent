import { describe, it, expect } from 'vitest';
import { formatDuration, formatTokens, runTooltip, rateColor, rateCls } from '../../src/utils/usage-formatters.js';

describe('usage-formatters', () => {
  describe('formatDuration', () => {
    it('formats seconds', () => {
      expect(formatDuration(45)).toBe('45s');
    });

    it('formats minutes and seconds', () => {
      expect(formatDuration(90)).toBe('1m 30s');
    });

    it('formats minutes only when exact', () => {
      expect(formatDuration(120)).toBe('2m');
    });

    it('formats hours and minutes', () => {
      expect(formatDuration(3660)).toBe('1h 1m');
    });

    it('formats hours only when exact', () => {
      expect(formatDuration(3600)).toBe('1h');
    });

    it('returns 0s for zero/null/negative', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(null)).toBe('0s');
      expect(formatDuration(-5)).toBe('0s');
    });
  });

  describe('formatTokens', () => {
    it('formats zero', () => {
      expect(formatTokens(0)).toBe('0');
      expect(formatTokens(null)).toBe('0');
    });

    it('formats thousands with k suffix', () => {
      expect(formatTokens(1500)).toBe('1.5k');
    });

    it('formats millions with M suffix', () => {
      expect(formatTokens(2300000)).toBe('2.3M');
    });

    it('formats small numbers as-is', () => {
      expect(formatTokens(500)).toBe('500');
    });
  });

  describe('runTooltip', () => {
    it('builds tooltip string', () => {
      const day = { label: '15/03', total: 5, success: 3, error: 1, running: 1 };
      expect(runTooltip(day)).toBe('15/03: 5 (3 ok, 1 err, 1 en cours)');
    });

    it('omits running when zero', () => {
      const day = { label: '15/03', total: 2, success: 2, error: 0, running: 0 };
      expect(runTooltip(day)).toBe('15/03: 2 (2 ok, 0 err)');
    });
  });

  describe('rateColor', () => {
    it('returns green for high rate', () => {
      expect(rateColor(80)).toBe('var(--green)');
    });

    it('returns red for low rate', () => {
      expect(rateColor(50)).toBe('#ff6b6b');
    });

    it('returns green at threshold', () => {
      expect(rateColor(70)).toBe('var(--green)');
    });
  });

  describe('rateCls', () => {
    it('returns green class for high rate', () => {
      expect(rateCls(80)).toBe('usage-stat-value-green');
    });

    it('returns red class for low rate', () => {
      expect(rateCls(50)).toBe('usage-stat-value-red');
    });
  });
});
