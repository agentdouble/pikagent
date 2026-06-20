import { describe, it, expect, vi } from 'vitest';
import {
  DEFAULT_BINDINGS,
  ACTION_HANDLERS,
  ALWAYS_ALLOWED_IDS,
} from '../../src/utils/shortcut-helpers.js';

describe('shortcut-helpers', () => {
  it('defines default control-number workspace shortcuts', () => {
    for (let index = 1; index <= 9; index += 1) {
      expect(DEFAULT_BINDINGS).toContainEqual({
        id: `goToTab${index}`,
        label: `Go to Workspace ${index}`,
        keys: [`control+${index}`],
      });
    }
  });

  it('routes direct tab shortcuts to tabManager.goToTabIndex', () => {
    const tabManager = { goToTabIndex: vi.fn() };

    ACTION_HANDLERS.goToTab1(tabManager);
    ACTION_HANDLERS.goToTab9(tabManager);

    expect(tabManager.goToTabIndex).toHaveBeenCalledWith(1);
    expect(tabManager.goToTabIndex).toHaveBeenCalledWith(9);
  });

  it('allows direct tab shortcuts while current tab disables shortcuts', () => {
    expect(ALWAYS_ALLOWED_IDS.has('goToTab1')).toBe(true);
    expect(ALWAYS_ALLOWED_IDS.has('goToTab9')).toBe(true);
  });
});
