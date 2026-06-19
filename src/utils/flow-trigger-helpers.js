import { formatSchedule } from './flow-schedule-helpers.js';

export const TRIGGER_TYPE_LABELS = {
  schedule: 'Horaire',
  hook: 'Hook',
};

export const HOOK_PROVIDER_OPTIONS = ['any', 'codex', 'claude', 'opencode', 'watcher'];
export const DEFAULT_HOOK_EVENT = 'file.changed';
export const DEFAULT_HOOK_DEBOUNCE_SECONDS = 30;

export function parsePathPatterns(value) {
  return String(value || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function joinPathPatterns(paths) {
  return (paths || []).join(', ');
}

export function buildHookTrigger(event, provider, paths, debounceSeconds) {
  const parsedDebounce = Math.max(0, parseInt(String(debounceSeconds), 10) || 0);
  return {
    type: 'hook',
    event: event.trim() || DEFAULT_HOOK_EVENT,
    provider: provider.trim() || 'any',
    paths: parsePathPatterns(paths),
    debounceSeconds: parsedDebounce,
  };
}

export function formatHookTrigger(trigger) {
  if (!trigger) return 'Hook non configuré';
  const provider = trigger.provider && trigger.provider !== 'any' ? ` · ${trigger.provider}` : '';
  const paths = trigger.paths?.length ? ` · ${trigger.paths.join(', ')}` : '';
  const debounce = trigger.debounceSeconds ? ` · ${trigger.debounceSeconds}s` : '';
  return `Hook ${trigger.event}${provider}${paths}${debounce}`;
}

export function formatFlowTrigger(flow) {
  if (flow.triggerType === 'hook' || flow.hookTrigger) {
    return formatHookTrigger(flow.hookTrigger);
  }
  return formatSchedule(flow.schedule);
}
