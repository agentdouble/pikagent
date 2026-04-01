// Pure schedule data & formatting — no DOM, no I/O.

export const SCHEDULE_LABELS = {
  interval: 'Intervalle',
  daily: 'Tous les jours',
  weekdays: 'Jours de la semaine',
  custom: 'Personnalisé',
};

export const DAY_NAMES = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export const WEEKDAY_INDICES = [1, 2, 3, 4, 5];
export const INTERVAL_HOURS = [1, 2, 3, 4, 6, 8, 12];
export const DEFAULT_TIME = '09:00';

/**
 * Single source of truth for schedule type behavior:
 *  - chips: which UI chips to show (time, interval, days)
 *  - buildFields: produce type-specific fields for the schedule data object
 *  - format: produce a human-readable label from a schedule object
 */
export const SCHEDULE_TYPE_CONFIG = {
  interval: {
    chips: { time: false, interval: true, days: false },
    buildFields: (_, intervalValue) => ({ intervalHours: parseInt(intervalValue, 10) }),
    format: (s) => `Toutes les ${s.intervalHours || 1}h`,
  },
  daily: {
    chips: { time: true, interval: false, days: false },
    buildFields: (timeValue) => ({ time: timeValue || DEFAULT_TIME }),
    format: (s) => `${SCHEDULE_LABELS.daily} à ${s.time || '00:00'}`,
  },
  weekdays: {
    chips: { time: true, interval: false, days: false },
    buildFields: (timeValue) => ({ time: timeValue || DEFAULT_TIME }),
    format: (s) => `${SCHEDULE_LABELS.weekdays} à ${s.time || '00:00'}`,
  },
  custom: {
    chips: { time: true, interval: false, days: true },
    buildFields: (timeValue, _, selectedDays) => ({ time: timeValue || DEFAULT_TIME, days: [...selectedDays].sort() }),
    format: (s) => s.days
      ? `${s.days.map((d) => DAY_NAMES[d]).join(', ')} à ${s.time || '00:00'}`
      : `${SCHEDULE_LABELS.custom} à ${s.time || '00:00'}`,
  },
};

export function buildScheduleData(type, timeValue, intervalValue, selectedDays) {
  const config = SCHEDULE_TYPE_CONFIG[type];
  return { type, ...(config ? config.buildFields(timeValue, intervalValue, selectedDays) : {}) };
}

export function formatSchedule(schedule) {
  if (!schedule) return 'Non planifié';
  const config = SCHEDULE_TYPE_CONFIG[schedule.type];
  if (!config) return `${schedule.type} à ${schedule.time || '00:00'}`;
  return config.format(schedule);
}
