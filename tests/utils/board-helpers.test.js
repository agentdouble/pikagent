import { describe, expect, it } from 'vitest';
import {
  appendPreviewChunk,
  formatElapsed,
  formatShortPath,
  getPreviewText,
  stripAnsi,
} from '../../src/utils/board-helpers.js';

describe('board-helpers', () => {
  it('formats cwd paths for compact board display', () => {
    expect(formatShortPath('/Users/jeremy/projet/pickagent')).toBe('.../projet/pickagent');
    expect(formatShortPath('/repo')).toBe('/repo');
    expect(formatShortPath(null)).toBe('-');
  });

  it('formats elapsed time buckets', () => {
    expect(formatElapsed(500)).toBe('now');
    expect(formatElapsed(12_000)).toBe('12s ago');
    expect(formatElapsed(90_000)).toBe('1m ago');
    expect(formatElapsed(3_600_000)).toBe('1h ago');
  });

  it('strips ansi control sequences from preview text', () => {
    expect(stripAnsi('\u001b[32mRunning\u001b[0m')).toBe('Running');
  });

  it('keeps only the latest meaningful preview lines', () => {
    const state = { lines: [], remainder: '' };

    appendPreviewChunk(state, 'one\n\ntwo\nthree\nfour\n', 3);

    expect(state.lines).toEqual(['two', 'three', 'four']);
  });

  it('keeps partial chunks readable without duplicating them', () => {
    const state = { lines: [], remainder: '' };

    appendPreviewChunk(state, 'work', 3);
    expect(getPreviewText(state)).toBe('work');

    appendPreviewChunk(state, 'ing\nnext', 3);
    expect(getPreviewText(state)).toBe('working\nnext');
  });
});
