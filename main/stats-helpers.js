const DEFAULT_DAYS = 30;

const STATUS_CATEGORIES = {
  success: new Set(['success', 'completed']),
  error: new Set(['error', 'exited']),
  running: new Set(['running']),
};

const STATUS_KEYS = Object.keys(STATUS_CATEGORIES);

function countByStatus(items, field = 'status') {
  const counts = Object.fromEntries(STATUS_KEYS.map((k) => [k, 0]));
  for (const item of items) {
    const val = item[field];
    for (const key of STATUS_KEYS) {
      if (STATUS_CATEGORIES[key].has(val)) { counts[key]++; break; }
    }
  }
  return counts;
}

function computeRate(items, statusField = 'status') {
  if (items.length === 0) return { total: 0, success: 0, error: 0, rate: 0 };
  const { success, error } = countByStatus(items, statusField);
  return {
    total: items.length,
    success,
    error,
    rate: Math.round((success / items.length) * 100),
  };
}

function computeDuration(durations) {
  const valid = durations.filter((d) => d != null && d > 0);
  if (valid.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return {
    avg: Math.round(avg),
    min: Math.round(Math.min(...valid)),
    max: Math.round(Math.max(...valid)),
    count: valid.length,
  };
}

function dateStr(iso) {
  return iso ? iso.slice(0, 10) : null;
}

function dayLabels(days = DEFAULT_DAYS) {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    };
  });
}

function perDay(items, dateExtractor, days = DEFAULT_DAYS) {
  const labels = dayLabels(days);
  return labels.map((day) => {
    const dayItems = items.filter((r) => dateExtractor(r) === day.date);
    return { ...day, total: dayItems.length, ...countByStatus(dayItems) };
  });
}

module.exports = { DEFAULT_DAYS, countByStatus, computeRate, computeDuration, dateStr, dayLabels, perDay };
