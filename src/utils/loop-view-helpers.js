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

export const AGENT_OPTIONS = {
  claude: 'Claude',
  codex: 'Codex',
  opencode: 'OpenCode',
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
  if (node.type === 'executable' && node.persistent) return 'green';
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
  if (node.triggerType === 'hook' || node.hookTrigger) {
    return formatHookTrigger(node.hookTrigger || defaultAgentHookTrigger());
  }
  return formatSchedule(node.schedule || defaultAgentSchedule());
}

export function selectedEdges(loop, selectedNodeId) {
  return loop.edges.filter((edge) => edge.from === selectedNodeId || edge.to === selectedNodeId);
}

export function processMap(snapshot) {
  return new Map((snapshot?.processes || []).map((process) => [process.nodeId, process]));
}

export function runningCount(snapshot) {
  return (snapshot?.processes || []).filter((process) => process.status === 'running').length;
}
