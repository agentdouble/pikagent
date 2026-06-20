import { describe, expect, it } from 'vitest';
import {
  captureLogScrollState,
  clampZoom,
  createNode,
  defaultEdgePorts,
  edgeGeometry,
  formatHeadlessAgentLabel,
  formatHeadlessAgentPreview,
  nodePortPoint,
  restoreLogScrollState,
  splitHeadlessAgentsForBoard,
  zoomAtPoint,
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

  it('clamps board zoom to the supported range', () => {
    expect(clampZoom(0.1)).toBe(0.45);
    expect(clampZoom(2)).toBe(1.4);
    expect(clampZoom(0.85)).toBe(0.85);
    expect(clampZoom('bad')).toBe(1);
  });

  it('keeps the cursor anchor stable when zooming around a board point', () => {
    const result = zoomAtPoint({
      zoom: 1,
      panOffset: { x: 10, y: 20 },
      point: { x: 210, y: 120 },
      nextZoom: 1.2,
    });

    expect(result).toEqual({
      zoom: 1.2,
      panOffset: { x: -30, y: 0 },
    });
  });

  it('creates codex agent nodes without model overrides by default', () => {
    const node = createNode('agent', 0);

    expect(node.agent).toBe('codex');
    expect(node.model).toBe('');
    expect(node.reasoningEffort).toBe('');
    expect(node.serviceTier).toBe('');
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

  it('computes one link port point per node side', () => {
    const node = { x: 100, y: 200 };

    expect(nodePortPoint(node, 'top')).toEqual({ x: 210, y: 192 });
    expect(nodePortPoint(node, 'right')).toEqual({ x: 328, y: 310 });
    expect(nodePortPoint(node, 'bottom')).toEqual({ x: 210, y: 428 });
    expect(nodePortPoint(node, 'left')).toEqual({ x: 92, y: 310 });
  });

  it('chooses default ports from node relative positions', () => {
    expect(defaultEdgePorts({ x: 0, y: 0 }, { x: 300, y: 20 })).toEqual({
      fromPort: 'right',
      toPort: 'left',
    });
    expect(defaultEdgePorts({ x: 0, y: 0 }, { x: 20, y: 300 })).toEqual({
      fromPort: 'bottom',
      toPort: 'top',
    });
  });

  it('builds styled edge paths with optional bend handles', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 300, y: 0 };

    const straight = edgeGeometry({ pathType: 'straight' }, from, to);
    expect(straight.d).toContain(' L ');
    expect(straight.hasHandle).toBe(false);

    const curve = edgeGeometry({ fromPort: 'bottom', toPort: 'top', bendX: 12, bendY: -20 }, from, to);
    expect(curve.d).toContain(' Q ');
    expect(curve.hasHandle).toBe(true);
    expect(curve.fromPort).toBe('bottom');
    expect(curve.toPort).toBe('top');
    expect(curve.handle).toEqual({ x: 272, y: 90 });

    const elbow = edgeGeometry({ pathType: 'elbow' }, from, to);
    expect(elbow.d.split(' L ')).toHaveLength(4);
    expect(elbow.hasHandle).toBe(true);
  });

  it('uses the requested routing mode when the edge has no explicit path type', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 300, y: 0 };

    expect(edgeGeometry({}, from, to, 'elbow').pathType).toBe('elbow');
    expect(edgeGeometry({}, from, to, 'curve').pathType).toBe('curve');
  });
});
