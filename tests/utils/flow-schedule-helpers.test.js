import { describe, it, expect } from 'vitest';
import { buildScheduleData, formatSchedule, SCHEDULE_LABELS, DAY_NAMES } from '../../src/utils/flow-schedule-helpers.js';

describe('flow-schedule-helpers', () => {
  describe('buildScheduleData', () => {
    it('builds interval schedule', () => {
      const result = buildScheduleData('interval', '09:00', '4', []);
      expect(result).toEqual({ type: 'interval', intervalHours: 4 });
    });

    it('builds daily schedule with time', () => {
      const result = buildScheduleData('daily', '14:30', '1', []);
      expect(result).toEqual({ type: 'daily', time: '14:30' });
    });

    it('builds custom schedule with days', () => {
      const result = buildScheduleData('custom', '10:00', '1', [1, 3, 5]);
      expect(result).toEqual({ type: 'custom', time: '10:00', days: [1, 3, 5] });
    });

    it('uses default time when empty', () => {
      const result = buildScheduleData('daily', '', '1', []);
      expect(result.time).toBe('09:00');
    });
  });

  describe('formatSchedule', () => {
    it('formats interval schedule', () => {
      expect(formatSchedule({ type: 'interval', intervalHours: 4 })).toBe('Toutes les 4h');
    });

    it('formats daily schedule', () => {
      expect(formatSchedule({ type: 'daily', time: '14:30' })).toBe('Tous les jours à 14:30');
    });

    it('formats weekdays schedule', () => {
      expect(formatSchedule({ type: 'weekdays', time: '09:00' })).toBe('Jours de la semaine à 09:00');
    });

    it('formats custom schedule with day names', () => {
      const result = formatSchedule({ type: 'custom', time: '10:00', days: [1, 3, 5] });
      expect(result).toBe('Lun, Mer, Ven à 10:00');
    });

    it('returns "Non planifié" for null', () => {
      expect(formatSchedule(null)).toBe('Non planifié');
    });
  });

  describe('constants', () => {
    it('SCHEDULE_LABELS has 4 entries', () => {
      expect(Object.keys(SCHEDULE_LABELS)).toHaveLength(4);
    });

    it('DAY_NAMES has 7 entries starting with Dim', () => {
      expect(DAY_NAMES).toHaveLength(7);
      expect(DAY_NAMES[0]).toBe('Dim');
    });
  });
});
