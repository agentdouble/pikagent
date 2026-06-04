import { describe, expect, it, vi } from 'vitest';
import {
  appendPreviewChunk,
  formatElapsed,
  formatShortPath,
  getPreviewText,
  getTerminalBufferPreview,
  sendBoardReply,
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
    expect(stripAnsi('\u001b]0;title\u0007Ready')).toBe('Ready');
    expect(stripAnsi('abc\b \bd')).toBe('abd');
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

  it('treats carriage returns as line rewrites in fallback previews', () => {
    const state = { lines: [], remainder: '' };

    appendPreviewChunk(state, 'Working 1\rWorking 2\rDone\n', 3);

    expect(state.lines).toEqual(['Done']);
  });

  it('reads rendered terminal buffer lines for clean board previews', () => {
    const lines = [
      { translateToString: () => 'old', isWrapped: false },
      { translateToString: () => '', isWrapped: false },
      { translateToString: () => 'agent response', isWrapped: false },
      { translateToString: () => ' continued', isWrapped: true },
      { translateToString: () => 'prompt', isWrapped: false },
    ];
    const terminal = {
      rows: 5,
      buffer: {
        active: {
          length: lines.length,
          baseY: 0,
          getLine: (index) => lines[index],
        },
      },
    };

    expect(getTerminalBufferPreview(terminal, 2)).toBe('agent response continued\nprompt');
  });

  it('sends board replies with a newline and ignores empty values', () => {
    const write = vi.fn();

    expect(sendBoardReply('term_1', ' continue ', write)).toBe(true);
    expect(write).toHaveBeenCalledWith('term_1', 'continue\n');

    expect(sendBoardReply('term_1', ' ', write)).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
  });
});
