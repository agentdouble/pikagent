import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import os from 'os';
import path from 'path';
import fsp from 'fs/promises';

const {
  getCodexUsageMetrics,
  _internals,
} = require('../../main/codex-usage-collector');

let tmpDir;

function tokenCountLine({ timestamp = '2026-07-02T10:00:41.234Z', primary = 11, secondary = 48 } = {}) {
  return JSON.stringify({
    timestamp,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: {
          input_tokens: 319532,
          cached_input_tokens: 263168,
          output_tokens: 4419,
          reasoning_output_tokens: 1756,
          total_tokens: 323951,
        },
        last_token_usage: {
          input_tokens: 58817,
          cached_input_tokens: 56192,
          output_tokens: 828,
          reasoning_output_tokens: 516,
          total_tokens: 59645,
        },
        model_context_window: 258400,
      },
      rate_limits: {
        limit_id: 'codex',
        primary: { used_percent: primary, window_minutes: 300, resets_at: 1783002219 },
        secondary: { used_percent: secondary, window_minutes: 10080, resets_at: 1783510987 },
        credits: null,
        individual_limit: null,
        plan_type: 'pro',
        rate_limit_reached_type: null,
      },
    },
  });
}

beforeEach(async () => {
  tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pickagent-codex-usage-'));
});

afterEach(async () => {
  await fsp.rm(tmpDir, { recursive: true, force: true });
});

describe('codex-usage-collector', () => {
  it('parses and normalizes the latest token_count event from JSONL text', () => {
    const event = _internals.parseLatestTokenCountEvent([
      tokenCountLine({ timestamp: '2026-07-02T09:00:00.000Z', primary: 10 }),
      'not json',
      tokenCountLine({ timestamp: '2026-07-02T10:00:00.000Z', primary: 12 }),
    ].join('\n'), '/tmp/session.jsonl');

    const metrics = _internals.normalizeCodexUsageEvent(event, event.sourceFile);
    expect(metrics.available).toBe(true);
    expect(metrics.planType).toBe('pro');
    expect(metrics.totalTokenUsage.totalTokens).toBe(323951);
    expect(metrics.lastTokenUsage.totalTokens).toBe(59645);
    expect(metrics.limits).toMatchObject([
      { key: 'primary', label: '5h', usedPercent: 12, remainingPercent: 88 },
      { key: 'secondary', label: 'Hebdo', usedPercent: 48, remainingPercent: 52 },
    ]);
  });

  it('reads recent Codex session files and returns current rate limits', async () => {
    const sessionDir = path.join(tmpDir, '2026', '07', '02');
    await fsp.mkdir(sessionDir, { recursive: true });
    await fsp.writeFile(path.join(sessionDir, 'rollout.jsonl'), [
      JSON.stringify({ timestamp: '2026-07-02T09:00:00.000Z', type: 'event_msg', payload: { type: 'message' } }),
      tokenCountLine(),
    ].join('\n'));

    const metrics = await getCodexUsageMetrics({ sessionsDir: tmpDir });

    expect(metrics.available).toBe(true);
    expect(metrics.sampledAt).toBe('2026-07-02T10:00:41.234Z');
    expect(metrics.limits.find((limit) => limit.key === 'secondary')).toMatchObject({
      label: 'Hebdo',
      usedPercent: 48,
      remainingPercent: 52,
    });
  });

  it('returns unavailable metrics when no token_count event exists', async () => {
    const sessionDir = path.join(tmpDir, '2026', '07', '02');
    await fsp.mkdir(sessionDir, { recursive: true });
    await fsp.writeFile(path.join(sessionDir, 'rollout.jsonl'), '{}\n');

    const metrics = await getCodexUsageMetrics({ sessionsDir: tmpDir });

    expect(metrics).toEqual({ available: false, limits: [] });
  });
});
