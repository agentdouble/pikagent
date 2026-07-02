const fsp = require('fs/promises');
const path = require('path');
const { CODEX_SESSIONS_DIR } = require('./paths');
const { createLogger, trySafe } = require('./logger');

const log = createLogger('codex-usage-collector');

const SESSION_FILE_LIMIT = 80;
const SESSION_TAIL_BYTES = 512 * 1024;

async function listSessionFiles(dirPath) {
  let entries;
  try {
    entries = await fsp.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSessionFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(entryPath);
    }
  }
  return files;
}

async function recentSessionFiles(sessionsDir, limit = SESSION_FILE_LIMIT) {
  const files = await listSessionFiles(sessionsDir);
  const withStats = await Promise.all(files.map(async (filePath) => {
    try {
      const stat = await fsp.stat(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    } catch {
      return null;
    }
  }));

  return withStats
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.filePath);
}

async function readTail(filePath, maxBytes = SESSION_TAIL_BYTES) {
  const file = await fsp.open(filePath, 'r');
  try {
    const stat = await file.stat();
    const start = Math.max(0, stat.size - maxBytes);
    const length = stat.size - start;
    const buffer = Buffer.alloc(length);
    await file.read(buffer, 0, length, start);
    return buffer.toString('utf-8');
  } finally {
    await file.close();
  }
}

function toIsoFromEpochSeconds(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  return new Date(seconds * 1000).toISOString();
}

function clampPercent(value) {
  const percent = Number(value);
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, percent));
}

function limitLabel(key, windowMinutes) {
  if (windowMinutes === 10080 || key === 'secondary') return 'Hebdo';
  if (windowMinutes && windowMinutes % 60 === 0) return `${windowMinutes / 60}h`;
  return key === 'primary' ? 'Fenêtre courte' : key;
}

function normalizeLimit(key, limit) {
  const windowMinutes = Number(limit?.window_minutes) || 0;
  const usedPercent = clampPercent(limit?.used_percent);
  return {
    key,
    label: limitLabel(key, windowMinutes),
    usedPercent,
    remainingPercent: Math.max(0, 100 - usedPercent),
    windowMinutes,
    resetsAt: toIsoFromEpochSeconds(limit?.resets_at),
  };
}

function normalizeCodexUsageEvent(entry, sourceFile = '') {
  const payload = entry?.payload || {};
  const rateLimits = payload.rate_limits || {};
  const info = payload.info || {};
  const totalUsage = info.total_token_usage || {};
  const lastUsage = info.last_token_usage || {};
  const limits = ['primary', 'secondary']
    .filter((key) => rateLimits[key])
    .map((key) => normalizeLimit(key, rateLimits[key]));

  return {
    available: limits.length > 0,
    sampledAt: entry?.timestamp || '',
    source: 'codex-session-log',
    sourceFile,
    planType: rateLimits.plan_type || '',
    rateLimitReachedType: rateLimits.rate_limit_reached_type || '',
    totalTokenUsage: {
      inputTokens: Number(totalUsage.input_tokens) || 0,
      cachedInputTokens: Number(totalUsage.cached_input_tokens) || 0,
      outputTokens: Number(totalUsage.output_tokens) || 0,
      reasoningOutputTokens: Number(totalUsage.reasoning_output_tokens) || 0,
      totalTokens: Number(totalUsage.total_tokens) || 0,
    },
    lastTokenUsage: {
      inputTokens: Number(lastUsage.input_tokens) || 0,
      cachedInputTokens: Number(lastUsage.cached_input_tokens) || 0,
      outputTokens: Number(lastUsage.output_tokens) || 0,
      reasoningOutputTokens: Number(lastUsage.reasoning_output_tokens) || 0,
      totalTokens: Number(lastUsage.total_tokens) || 0,
    },
    modelContextWindow: Number(info.model_context_window) || 0,
    limits,
  };
}

function parseLatestTokenCountEvent(text, sourceFile = '') {
  let latest = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.includes('"token_count"')) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (entry?.type !== 'event_msg' || entry?.payload?.type !== 'token_count') continue;
    if (!latest || new Date(entry.timestamp).getTime() >= new Date(latest.timestamp).getTime()) {
      latest = { ...entry, sourceFile };
    }
  }
  return latest;
}

function newerTokenCountEvent(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aTime = new Date(a.timestamp).getTime();
  const bTime = new Date(b.timestamp).getTime();
  return bTime >= aTime ? b : a;
}

async function findLatestTokenCountEvent(sessionsDir = CODEX_SESSIONS_DIR) {
  const files = await recentSessionFiles(sessionsDir);
  let latest = null;
  for (const filePath of files) {
    let text;
    try {
      text = await readTail(filePath);
    } catch {
      continue;
    }
    latest = newerTokenCountEvent(latest, parseLatestTokenCountEvent(text, filePath));
  }
  return latest;
}

async function getCodexUsageMetrics(options = {}) {
  return trySafe(
    async () => {
      const event = await findLatestTokenCountEvent(options.sessionsDir || CODEX_SESSIONS_DIR);
      if (!event) return { available: false, limits: [] };
      return normalizeCodexUsageEvent(event, event.sourceFile);
    },
    { available: false, limits: [] },
    { log, label: 'getCodexUsageMetrics' },
  );
}

module.exports = {
  getCodexUsageMetrics,
  _internals: {
    parseLatestTokenCountEvent,
    normalizeCodexUsageEvent,
    recentSessionFiles,
    readTail,
  },
};
