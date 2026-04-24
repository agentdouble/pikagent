import { describe, it, expect } from 'vitest';
import {
  DRAG_THRESHOLD, PANEL_MIN_WIDTH,
  ACTIVITY_BUTTONS, COLOR_GROUPS, SIDE_VIEWS,
} from '../../src/utils/tab-constants.js';
import { WorkspaceTab } from '../../src/utils/tab-types.js';
import {
  clampPanelWidth, panelArrowState, reorderEntries,
  findCycleTarget, findColorGroupTarget,
} from '../../src/utils/tab-manager-helpers.js';

describe('tab-manager-helpers', () => {
  // ── Constants ──

  describe('constants', () => {
    it('DRAG_THRESHOLD is a positive number', () => {
      expect(DRAG_THRESHOLD).toBeGreaterThan(0);
    });

    it('PANEL_MIN_WIDTH is a positive number', () => {
      expect(PANEL_MIN_WIDTH).toBeGreaterThan(0);
    });

    it('left max < right max (validated via clampPanelWidth)', () => {
      expect(clampPanelWidth(9999, 'left')).toBeLessThan(clampPanelWidth(9999, 'right'));
    });
  });

  // ── ACTIVITY_BUTTONS ──

  describe('ACTIVITY_BUTTONS', () => {
    it('has label and mode for each entry', () => {
      for (const btn of ACTIVITY_BUTTONS) {
        expect(typeof btn.label).toBe('string');
        expect(typeof btn.mode).toBe('string');
      }
    });

    it('includes work and board modes', () => {
      const modes = ACTIVITY_BUTTONS.map((b) => b.mode);
      expect(modes).toContain('work');
      expect(modes).toContain('board');
    });
  });

  // ── COLOR_GROUPS ──

  describe('COLOR_GROUPS', () => {
    it('each entry has id, label, and color', () => {
      for (const cg of COLOR_GROUPS) {
        expect(typeof cg.id).toBe('string');
        expect(typeof cg.label).toBe('string');
        expect(cg.color).toMatch(/^#[0-9a-f]{6}$/i);
      }
    });

    it('has unique ids', () => {
      const ids = COLOR_GROUPS.map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ── SIDE_VIEWS ──

  describe('SIDE_VIEWS', () => {
    it('has entries for board, flow, and usage', () => {
      expect(SIDE_VIEWS).toHaveProperty('board');
      expect(SIDE_VIEWS).toHaveProperty('flow');
      expect(SIDE_VIEWS).toHaveProperty('usage');
    });

    it('each entry has viewKey and containerKey strings', () => {
      for (const cfg of Object.values(SIDE_VIEWS)) {
        expect(typeof cfg.viewKey).toBe('string');
        expect(typeof cfg.containerKey).toBe('string');
      }
    });

    it('viewKey and containerKey are unique across entries', () => {
      const viewKeys = Object.values(SIDE_VIEWS).map((c) => c.viewKey);
      const containerKeys = Object.values(SIDE_VIEWS).map((c) => c.containerKey);
      expect(new Set(viewKeys).size).toBe(viewKeys.length);
      expect(new Set(containerKeys).size).toBe(containerKeys.length);
    });

    it('board has pauseOnDetach, others do not', () => {
      expect(SIDE_VIEWS.board.pauseOnDetach).toBe(true);
      expect(SIDE_VIEWS.flow.pauseOnDetach).toBeFalsy();
      expect(SIDE_VIEWS.usage.pauseOnDetach).toBeFalsy();
    });
  });

  // ── WorkspaceTab ──

  describe('WorkspaceTab', () => {
    it('initializes with id, name, cwd', () => {
      const tab = new WorkspaceTab('t1', 'My Tab', '/home');
      expect(tab.id).toBe('t1');
      expect(tab.name).toBe('My Tab');
      expect(tab.cwd).toBe('/home');
      expect(tab.noShortcut).toBe(false);
      expect(tab.colorGroup).toBeNull();
    });
  });

  // ── clampPanelWidth ──

  describe('clampPanelWidth', () => {
    it('clamps below PANEL_MIN_WIDTH', () => {
      expect(clampPanelWidth(10, 'left')).toBe(PANEL_MIN_WIDTH);
    });

    it('clamps above max for left side', () => {
      const clamped = clampPanelWidth(9999, 'left');
      expect(clamped).toBeLessThan(9999);
      expect(clamped).toBeGreaterThan(PANEL_MIN_WIDTH);
    });

    it('clamps above max for right side', () => {
      const clamped = clampPanelWidth(9999, 'right');
      expect(clamped).toBeLessThan(9999);
      expect(clamped).toBeGreaterThan(PANEL_MIN_WIDTH);
    });

    it('passes through valid width', () => {
      expect(clampPanelWidth(300, 'left')).toBe(300);
    });
  });

  // ── panelArrowState ──

  describe('panelArrowState', () => {
    it('returns expand arrow when left panel is collapsed', () => {
      const { text, title } = panelArrowState('left', true);
      expect(text).toBe('\u2192');
      expect(title).toContain('Expand');
    });

    it('returns collapse arrow when left panel is expanded', () => {
      const { text, title } = panelArrowState('left', false);
      expect(text).toBe('\u2190');
      expect(title).toContain('Collapse');
    });

    it('returns expand arrow when right panel is collapsed', () => {
      const { text } = panelArrowState('right', true);
      expect(text).toBe('\u2190');
    });

    it('returns collapse arrow when right panel is expanded', () => {
      const { text } = panelArrowState('right', false);
      expect(text).toBe('\u2192');
    });
  });

  // ── reorderEntries ──

  describe('reorderEntries', () => {
    const entries = [['a', 1], ['b', 2], ['c', 3]];

    it('moves entry before target', () => {
      const result = reorderEntries(entries, 'c', 'a', true);
      expect(result.map(([id]) => id)).toEqual(['c', 'a', 'b']);
    });

    it('moves entry after target', () => {
      const result = reorderEntries(entries, 'a', 'c', false);
      expect(result.map(([id]) => id)).toEqual(['b', 'c', 'a']);
    });

    it('does not mutate original', () => {
      reorderEntries(entries, 'c', 'a', true);
      expect(entries.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    });
  });

  // ── findCycleTarget ──

  describe('findCycleTarget', () => {
    function makeTabs(specs) {
      const map = new Map();
      for (const [id, opts] of specs) {
        map.set(id, { noShortcut: false, colorGroup: null, ...opts });
      }
      return map;
    }

    it('cycles forward', () => {
      const tabs = makeTabs([['a', {}], ['b', {}], ['c', {}]]);
      expect(findCycleTarget(tabs, 'a', 1)).toBe('b');
    });

    it('cycles backward', () => {
      const tabs = makeTabs([['a', {}], ['b', {}], ['c', {}]]);
      expect(findCycleTarget(tabs, 'a', -1)).toBe('c');
    });

    it('skips noShortcut tabs', () => {
      const tabs = makeTabs([['a', {}], ['b', { noShortcut: true }], ['c', {}]]);
      expect(findCycleTarget(tabs, 'a', 1)).toBe('c');
    });

    it('skips tabs with different colorGroup', () => {
      const tabs = makeTabs([['a', { colorGroup: 'red' }], ['b', {}], ['c', { colorGroup: 'red' }]]);
      expect(findCycleTarget(tabs, 'a', 1)).toBe('c');
    });

    it('returns null with single tab', () => {
      const tabs = makeTabs([['a', {}]]);
      expect(findCycleTarget(tabs, 'a', 1)).toBeNull();
    });
  });

  // ── findColorGroupTarget ──

  describe('findColorGroupTarget', () => {
    function makeTabs(specs) {
      const map = new Map();
      for (const [id, opts] of specs) {
        map.set(id, { noShortcut: false, colorGroup: null, ...opts });
      }
      return map;
    }

    it('finds next tab in same color group', () => {
      const tabs = makeTabs([['a', { colorGroup: 'red' }], ['b', {}], ['c', { colorGroup: 'red' }]]);
      expect(findColorGroupTarget(tabs, 'a', 'red')).toBe('c');
    });

    it('wraps around', () => {
      const tabs = makeTabs([['a', { colorGroup: 'red' }], ['b', {}], ['c', { colorGroup: 'red' }]]);
      expect(findColorGroupTarget(tabs, 'c', 'red')).toBe('a');
    });

    it('returns null when no match', () => {
      const tabs = makeTabs([['a', {}], ['b', {}]]);
      expect(findColorGroupTarget(tabs, 'a', 'blue')).toBeNull();
    });

    it('skips noShortcut tabs', () => {
      const tabs = makeTabs([['a', { colorGroup: 'red' }], ['b', { colorGroup: 'red', noShortcut: true }], ['c', { colorGroup: 'red' }]]);
      expect(findColorGroupTarget(tabs, 'a', 'red')).toBe('c');
    });
  });
});
