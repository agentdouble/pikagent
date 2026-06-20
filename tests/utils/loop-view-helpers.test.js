import { describe, expect, it } from 'vitest';
import {
  captureLogScrollState,
  formatHeadlessAgentLabel,
  formatHeadlessAgentPreview,
  restoreLogScrollState,
  splitHeadlessAgentsForBoard,
} from '../../src/utils/loop-view-helpers.js';

describe('loop-view-helpers', () => {
  it('restores the previous log scroll position when the user is reading older output', () => {
    const before = { scrollTop: 42, scrollHeight: 400, clientHeight: 100 };
    const state = captureLogScrollState(before);
    const after = { scrollTop: 0, scrollHeight: 600, clientHeight: 100 };

    restoreLogScrollState(after, state);

    expect(after.scrollTop).toBe(42);
  });

  it('keeps the log pinned to the bottom when new output arrives at the bottom', () => {
    const before = { scrollTop: 300, scrollHeight: 400, clientHeight: 100 };
    const state = captureLogScrollState(before);
    const after = { scrollTop: 0, scrollHeight: 620, clientHeight: 100 };

    restoreLogScrollState(after, state);

    expect(after.scrollTop).toBe(620);
  });

  it('splits headless agents by active loop board', () => {
    const result = splitHeadlessAgentsForBoard([
      { id: 'a', loopBoardId: 'main' },
      { id: 'b', loopBoardId: 'other' },
      { id: 'c' },
    ], 'main');

    expect(result.current.map((agent) => agent.id)).toEqual(['a']);
    expect(result.other.map((agent) => agent.id)).toEqual(['b', 'c']);
  });

  it('formats compact headless agent labels and previews', () => {
    expect(formatHeadlessAgentLabel({ loopNodeId: 'node-1', pids: [123] })).toBe('node-1');
    expect(formatHeadlessAgentLabel({ cwd: '/Users/jeremy/lab/orch', pids: [123] })).toBe('orch');
    expect(formatHeadlessAgentPreview({ lastLogLines: ['a', 'b', 'c'] }, 2)).toBe('b\nc');
    expect(formatHeadlessAgentPreview({ lastLogLines: [] })).toBe('Aucun log lisible.');
  });
});
