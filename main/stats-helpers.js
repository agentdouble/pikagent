const DEFAULT_DAYS = 30;

const SUCCESS_STATUSES = new Set(['success', 'completed']);
const ERROR_STATUSES = new Set(['error', 'exited']);

function countByStatus(items, field = 'status') {
  let success = 0;
  let error = 0;
  for (const item of items) {
    if (SUCCESS_STATUSES.has(item[field])) success++;
    else if (ERROR_STATUSES.has(item[field])) error++;
  }
  return { success, error };
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
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
    });
  }
  return result;
}

function perDay(items, dateExtractor, days = DEFAULT_DAYS) {
  const labels = dayLabels(days);
  return labels.map((day) => {
    const dayItems = items.filter((r) => dateExtractor(r) === day.date);
    const { success, error } = countByStatus(dayItems);
    return {
      ...day,
      total: dayItems.length,
      success,
      error,
      running: dayItems.filter((r) => r.status === 'running').length,
    };
  });
}

module.exports = { DEFAULT_DAYS, countByStatus, computeRate, computeDuration, dateStr, dayLabels, perDay };
