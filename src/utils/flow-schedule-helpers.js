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
 * Build a schedule data object from primitive values.
 * @param {string} type        - 'interval' | 'daily' | 'weekdays' | 'custom'
 * @param {string} timeValue   - HH:MM string
 * @param {string|number} intervalValue - hours (will be parseInt'd)
 * @param {Iterable<number>} selectedDays - day indices (0-6)
 */
export function buildScheduleData(type, timeValue, intervalValue, selectedDays) {
  const schedule = { type };
  if (type === 'interval') {
    schedule.intervalHours = parseInt(intervalValue, 10);
  } else {
    schedule.time = timeValue || DEFAULT_TIME;
    if (type === 'custom') schedule.days = [...selectedDays].sort();
  }
  return schedule;
}

/**
 * Format a schedule object into a human-readable label.
 * @param {{ type: string, intervalHours?: number, time?: string, days?: number[] }} schedule
 * @returns {string}
 */
export function formatSchedule(schedule) {
  if (!schedule) return 'Non planifié';
  if (schedule.type === 'interval') {
    const h = schedule.intervalHours || 1;
    return `Toutes les ${h}h`;
  }
  const label = SCHEDULE_LABELS[schedule.type] || schedule.type;
  const time = schedule.time || '00:00';
  if (schedule.type === 'custom' && schedule.days) {
    const dayLabels = schedule.days.map((d) => DAY_NAMES[d]).join(', ');
    return `${dayLabels} à ${time}`;
  }
  return `${label} à ${time}`;
}
