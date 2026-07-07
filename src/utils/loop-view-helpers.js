import { generateId } from './id.js';
import {
  DEFAULT_TIME,
  WEEKDAY_INDICES,
  buildScheduleData,
  formatSchedule,
} from './flow-schedule-helpers.js';
import {
  DEFAULT_HOOK_DEBOUNCE_SECONDS,
  DEFAULT_HOOK_EVENT,
  buildHookTrigger,
  formatHookTrigger,
} from './flow-trigger-helpers.js';

export const REFRESH_MS = 2000;
export const NODE_SIZE = 220;
export const LOG_SCROLL_BOTTOM_THRESHOLD = 8;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 1.4;
export const DEFAULT_LOOP_VIEWPORT = {
  zoom: 0.85,
  panOffset: { x: 0, y: 0 },
};
export const EDGE_PORTS = {
  top: 'Haut',
  right: 'Droite',
  bottom: 'Bas',
  left: 'Gauche',
};
export const EDGE_PATH_TYPES = {
  curve: 'Courbe',
  straight: 'Droit',
  elbow: 'Angle',
};

export const AGENT_OPTIONS = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
};

export const CODEX_MODEL_SUGGESTIONS = [
  'gpt-5.5',
  'gpt-5.4',
  'gpt-5.4-mini',
  'gpt-5.3-codex-spark',
  'codex-auto-review',
];

export const CODEX_REASONING_EFFORT_OPTIONS = {
  '': 'Config par defaut',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
};

export const CODEX_SERVICE_TIER_OPTIONS = {
  '': 'Config par defaut',
  fast: 'Fast',
  standard: 'Standard',
};

export const NODE_COLOR_OPTIONS = [
  { value: 'default', label: 'Neutre' },
  { value: 'blue', label: 'Bleu' },
  { value: 'green', label: 'Vert' },
  { value: 'yellow', label: 'Jaune' },
  { value: 'red', label: 'Rouge' },
  { value: 'purple', label: 'Violet' },
];

export function createDefaultLoop() {
  return {
    id: 'main',
    name: 'Boucles',
    nodes: [],
    edges: [],
  };
}

export function createNode(type, index) {
  if (type === 'agent') return createAgentNode(index);
  if (type === 'watcher') return createWatcherNode(index);
  if (type === 'executable') return createExecutableNode(index);
  return createDisplayNode(index);
}

function createAgentNode(index) {
  const now = new Date().toISOString();
  return {
    id: generateId('node'),
    type: 'agent',
    title: 'Agent',
    x: 80 + index * 40,
    y: 80 + index * 40,
    color: 'blue',
    cwd: '',
    agent: 'codex',
    model: '',
    reasoningEffort: '',
    serviceTier: '',
    prompt: '',
    schedule: defaultAgentSchedule(),
    triggerType: 'schedule',
    dangerouslySkipPermissions: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function createExecutableNode(index) {
  const now = new Date().toISOString();
  return {
    id: generateId('node'),
    type: 'executable',
    title: 'Executable',
    x: 120 + index * 40,
    y: 120 + index * 40,
    color: 'default',
    cwd: '',
    command: 'echo "hello"',
    persistent: false,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

function createWatcherNode(index) {
  const now = new Date().toISOString();
  return {
    id: generateId('node'),
    type: 'executable',
    title: 'Watcher',
    x: 120 + index * 40,
    y: 120 + index * 40,
    color: 'green',
    cwd: '',
    command: './start.sh',
    persistent: true,
    enabled: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function isWatcherNode(node) {
  return node?.type === 'executable' && Boolean(node.persistent);
}

function createDisplayNode(index) {
  const now = new Date().toISOString();
  return {
    id: generateId('node'),
    type: 'display',
    title: 'Fichier',
    x: 160 + index * 40,
    y: 160 + index * 40,
    color: 'yellow',
    filePath: '',
    description: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function defaultAgentSchedule() {
  return buildScheduleData('weekdays', DEFAULT_TIME, 1, new Set(WEEKDAY_INDICES));
}

export function defaultAgentHookTrigger() {
  return buildHookTrigger(DEFAULT_HOOK_EVENT, 'any', '', DEFAULT_HOOK_DEBOUNCE_SECONDS);
}

export function getNodeColor(node) {
  if (node.color) return node.color;
  if (node.type === 'agent') return 'blue';
  if (node.type === 'display') return 'yellow';
  if (isWatcherNode(node)) return 'green';
  return 'default';
}

export function getNodeTitle(node) {
  if (node.type !== 'display') return node.title;
  const fileName = String(node.filePath || '').split(/[\\/]/).filter(Boolean).pop();
  return fileName || node.title || 'Fichier';
}

export function getNodePreview(node) {
  if (node.type === 'agent') return node.prompt || 'Prompt vide';
  if (node.type === 'executable') return node.command || 'Commande vide';
  return node.description || 'Description vide';
}

export function formatAgentTrigger(node) {
  if (node.triggerType === 'link') return 'Lien';
  if (node.triggerType === 'hook' || node.hookTrigger) {
    return formatHookTrigger(node.hookTrigger || defaultAgentHookTrigger());
  }
  return formatSchedule(node.schedule || defaultAgentSchedule());
}

export function selectedEdges(loop, selectedNodeId) {
  return loop.edges.filter((edge) => edge.from === selectedNodeId || edge.to === selectedNodeId);
}

export function normalizeEdgePort(value, fallback = 'right') {
  return Object.hasOwn(EDGE_PORTS, value) ? value : fallback;
}

export function normalizeEdgePathType(value) {
  return Object.hasOwn(EDGE_PATH_TYPES, value) ? value : 'curve';
}

export function defaultEdgePorts(from, to) {
  const fromCenter = nodeCenter(from);
  const toCenter = nodeCenter(to);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromPort: 'right', toPort: 'left' }
      : { fromPort: 'left', toPort: 'right' };
  }
  return dy >= 0
    ? { fromPort: 'bottom', toPort: 'top' }
    : { fromPort: 'top', toPort: 'bottom' };
}

export function nodePortPoint(node, port, offset = 8) {
  const normalized = normalizeEdgePort(port);
  const center = nodeCenter(node);
  if (normalized === 'top') return { x: center.x, y: node.y - offset };
  if (normalized === 'bottom') return { x: center.x, y: node.y + NODE_SIZE + offset };
  if (normalized === 'left') return { x: node.x - offset, y: center.y };
  return { x: node.x + NODE_SIZE + offset, y: center.y };
}

export function edgeGeometry(edge, from, to, pathTypeFallback = 'curve') {
  const defaults = defaultEdgePorts(from, to);
  const fromPort = normalizeEdgePort(edge?.fromPort, defaults.fromPort);
  const toPort = normalizeEdgePort(edge?.toPort, defaults.toPort);
  const start = nodePortPoint(from, fromPort);
  const end = nodePortPoint(to, toPort);
  const bendX = numberValue(edge?.bendX, 0);
  const bendY = numberValue(edge?.bendY, 0);
  const handle = {
    x: (start.x + end.x) / 2 + bendX,
    y: (start.y + end.y) / 2 + bendY,
  };
  const pathType = normalizeEdgePathType(edge?.pathType || pathTypeFallback);
  const d = buildEdgePathD(pathType, start, handle, end);

  return {
    d,
    end,
    fromPort,
    handle,
    hasHandle: pathType !== 'straight',
    pathType,
    start,
    toPort,
  };
}

function buildEdgePathD(pathType, start, handle, end) {
  if (pathType === 'straight') {
    return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }
  if (pathType === 'elbow') {
    return `M ${start.x} ${start.y} L ${handle.x} ${start.y} L ${handle.x} ${end.y} L ${end.x} ${end.y}`;
  }
  return `M ${start.x} ${start.y} Q ${handle.x} ${handle.y} ${end.x} ${end.y}`;
}

function nodeCenter(node) {
  return {
    x: Number(node?.x || 0) + NODE_SIZE / 2,
    y: Number(node?.y || 0) + NODE_SIZE / 2,
  };
}

export function processMap(snapshot) {
  return new Map((snapshot?.processes || []).map((process) => [process.nodeId, process]));
}

export function runningCount(snapshot) {
  return (snapshot?.processes || []).filter((process) => process.status === 'running').length;
}

export function clampZoom(value) {
  const parsed = Number(value);
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(parsed) ? parsed : 1));
}

export function normalizeLoopViewport(viewport, fallback = DEFAULT_LOOP_VIEWPORT) {
  const source = viewport && typeof viewport === 'object' ? viewport : {};
  const fallbackSource = fallback && typeof fallback === 'object' ? fallback : DEFAULT_LOOP_VIEWPORT;
  const fallbackPan = fallbackSource.panOffset && typeof fallbackSource.panOffset === 'object'
    ? fallbackSource.panOffset
    : DEFAULT_LOOP_VIEWPORT.panOffset;
  const panSource = source.panOffset && typeof source.panOffset === 'object'
    ? source.panOffset
    : {};
  const parsedZoom = Number(source.zoom);
  const parsedFallbackZoom = Number(fallbackSource.zoom);

  return {
    zoom: clampZoom(Number.isFinite(parsedZoom)
      ? parsedZoom
      : (Number.isFinite(parsedFallbackZoom) ? parsedFallbackZoom : DEFAULT_LOOP_VIEWPORT.zoom)),
    panOffset: {
      x: numberValue(panSource.x, numberValue(fallbackPan.x, DEFAULT_LOOP_VIEWPORT.panOffset.x)),
      y: numberValue(panSource.y, numberValue(fallbackPan.y, DEFAULT_LOOP_VIEWPORT.panOffset.y)),
    },
  };
}

export function zoomAtPoint({ zoom, panOffset, point, nextZoom }) {
  const currentZoom = clampZoom(zoom);
  const targetZoom = clampZoom(nextZoom);
  const currentPan = {
    x: numberValue(panOffset?.x, 0),
    y: numberValue(panOffset?.y, 0),
  };
  const anchor = {
    x: numberValue(point?.x, 0),
    y: numberValue(point?.y, 0),
  };
  const world = {
    x: (anchor.x - currentPan.x) / currentZoom,
    y: (anchor.y - currentPan.y) / currentZoom,
  };

  return {
    zoom: targetZoom,
    panOffset: {
      x: anchor.x - world.x * targetZoom,
      y: anchor.y - world.y * targetZoom,
    },
  };
}

export function splitHeadlessAgentsForBoard(agents, boardId = 'main') {
  const current = [];
  const other = [];
  for (const agent of agents || []) {
    if (agent?.loopBoardId === boardId) current.push(agent);
    else other.push(agent);
  }
  return { current, other };
}

export function formatHeadlessAgentLabel(agent) {
  if (agent?.loopNodeId) return agent.loopNodeId;
  if (agent?.taskId && agent?.title) return `${agent.taskId} - ${agent.title}`;
  if (agent?.worktreeName) return agent.worktreeName;
  if (agent?.cwd) return String(agent.cwd).split('/').filter(Boolean).at(-1) || agent.cwd;
  return `PID ${(agent?.pids || [])[0] || '-'}`;
}

export function formatHeadlessAgentPreview(agent, maxLines = 8) {
  const lines = Array.isArray(agent?.lastLogLines) ? agent.lastLogLines : [];
  return lines.length ? lines.slice(-maxLines).join('\n') : 'Aucun log lisible.';
}

export function captureLogScrollState(el, threshold = LOG_SCROLL_BOTTOM_THRESHOLD) {
  if (!el) return null;
  const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
  return {
    scrollTop: el.scrollTop,
    wasAtBottom: maxScrollTop - el.scrollTop <= threshold,
  };
}

export function restoreLogScrollState(el, state) {
  if (!el || !state) return;
  el.scrollTop = state.wasAtBottom ? el.scrollHeight : state.scrollTop;
}

function numberValue(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
