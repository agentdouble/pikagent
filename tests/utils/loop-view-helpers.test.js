import { describe, expect, it } from 'vitest';
import {
  captureLogScrollState,
  restoreLogScrollState,
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
});
