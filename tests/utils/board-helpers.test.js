import { describe, expect, it, vi } from 'vitest';
import {
  appendPreviewChunk,
  cleanReplyResponseText,
  formatBoardPreviewLines,
  formatBoardPreviewState,
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

    appendPreviewChunk(state, 'load', 3);
    expect(getPreviewText(state)).toBe('load');

    appendPreviewChunk(state, 'ing\nnext', 3);
    expect(getPreviewText(state)).toBe('loading\nnext');
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

  it('shows only the latest agent response from Codex terminal chrome', () => {
    const lines = [
      '• Salut Jeremy. Je suis prêt. MEMORY.md',
      'n’existe pas à /Users/jeremy.',
      '› salut ça va ?',
      '• Salut, ça va. Dis-moi ce que tu veux',
      'qu’on attaque.',
      '────────────────────────────────',
      '› Implement {feature}',
      '  gpt-5.5 xhigh fast · ~',
    ];

    expect(formatBoardPreviewLines(lines)).toBe(
      'Salut, ça va. Dis-moi ce que tu veux\nqu’on attaque.',
    );
  });

  it('filters Codex terminal chrome when reading the xterm buffer', () => {
    const lines = [
      { translateToString: () => '• Old response', isWrapped: false },
      { translateToString: () => '› salut ça va ?', isWrapped: false },
      { translateToString: () => '• Latest response', isWrapped: false },
      { translateToString: () => ' continued', isWrapped: true },
      { translateToString: () => '› Implement {feature}', isWrapped: false },
      { translateToString: () => '  gpt-5.5 xhigh fast · ~', isWrapped: false },
    ];
    const terminal = {
      rows: 6,
      buffer: {
        active: {
          length: lines.length,
          baseY: 0,
          getLine: (index) => lines[index],
        },
      },
    };

    expect(getTerminalBufferPreview(terminal)).toBe('Latest response continued');
  });

  it('suppresses transient Codex states instead of showing them as previews', () => {
    expect(formatBoardPreviewLines(['Working...'])).toBe('');
    expect(formatBoardPreviewLines(['Thinking'])).toBe('');
    expect(formatBoardPreviewLines([
      '› salut ça va ?',
      'Working',
      'Messages',
      '  gpt-5.5 xhigh fast · ~',
    ])).toBe('');
  });

  it('returns transient Codex states separately from stable preview text', () => {
    expect(formatBoardPreviewState(['Working...'])).toEqual({
      text: '',
      transientText: 'Working...',
    });
    expect(formatBoardPreviewState([
      '• Réponse stable.',
      'Working',
    ])).toEqual({
      text: 'Réponse stable.',
      transientText: 'Working',
    });
  });

  it('does not attach stale transient states before a newer answer', () => {
    expect(formatBoardPreviewState([
      'Working',
      '• Nouvelle réponse.',
    ])).toEqual({
      text: 'Nouvelle réponse.',
      transientText: '',
    });
  });

  it('cuts transient thinking lines after the latest response', () => {
    expect(formatBoardPreviewLines([
      '• Réponse stable.',
      'Thinking...',
      '› Implement {feature}',
    ])).toBe('Réponse stable.');
  });

  it('sends board replies as text followed by a separate terminal enter and ignores empty values', async () => {
    const write = vi.fn();

    await expect(sendBoardReply('term_1', ' continue ', write, { enterDelayMs: 0 })).resolves.toBe(true);
    expect(write).toHaveBeenNthCalledWith(1, 'term_1', 'continue');
    expect(write).toHaveBeenNthCalledWith(2, 'term_1', '\r');

    await expect(sendBoardReply('term_1', ' ', write, { enterDelayMs: 0 })).resolves.toBe(false);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('waits for async board reply writes before reporting success', async () => {
    const write = vi.fn().mockResolvedValue({});

    await expect(sendBoardReply('term_1', 'continue', write, { enterDelayMs: 0 })).resolves.toBe(true);
    expect(write).toHaveBeenNthCalledWith(1, 'term_1', 'continue');
    expect(write).toHaveBeenNthCalledWith(2, 'term_1', '\r');
  });

  it('removes the echoed board reply from captured agent responses', () => {
    expect(cleanReplyResponseText('continue\nDone.', 'continue')).toBe('Done.');
    expect(cleanReplyResponseText('Thinking...\nDone.', 'continue')).toBe('Thinking...\nDone.');
  });
});
