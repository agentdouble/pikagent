const path = require('path');

const ANY_PROVIDER = 'any';

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function normalizeCwd(value) {
  if (!value) return null;
  return path.resolve(value);
}

function isWithinCwd(eventCwd, flowCwd) {
  if (!flowCwd || !eventCwd) return true;
  const rel = path.relative(flowCwd, eventCwd);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegex(pattern) {
  const normalized = normalizePath(pattern.trim());
  let out = '^';
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    const next = normalized[i + 1];
    if (ch === '*' && next === '*') {
      out += '.*';
      i += 1;
    } else if (ch === '*') {
      out += '[^/]*';
    } else if (ch === '?') {
      out += '[^/]';
    } else {
      out += escapeRegex(ch);
    }
  }
  return new RegExp(`${out}$`);
}

function eventPaths(event) {
  const cwd = normalizeCwd(event.cwd);
  return (event.paths || [])
    .filter(Boolean)
    .map((p) => {
      const normalized = normalizePath(p);
      if (!cwd || !path.isAbsolute(normalized)) return normalized;
      return normalizePath(path.relative(cwd, normalized));
    });
}

function isHookFlow(flow) {
  return flow?.triggerType === 'hook' || !!flow?.hookTrigger;
}

function eventMatches(trigger, event) {
  if (trigger.event !== '*' && trigger.event !== event.type) return false;

  const provider = (trigger.provider || ANY_PROVIDER).toLowerCase();
  if (provider !== ANY_PROVIDER && provider !== (event.provider || '').toLowerCase()) return false;

  const patterns = (trigger.paths || []).map((p) => p.trim()).filter(Boolean);
  if (!patterns.length) return true;

  const paths = eventPaths(event);
  if (!paths.length) return false;

  const regexes = patterns.map(globToRegex);
  return paths.some((p) => regexes.some((re) => re.test(normalizePath(p))));
}

function flowMatchesHookEvent(flow, event) {
  if (!flow?.enabled || !flow.hookTrigger || !isHookFlow(flow)) return false;
  if (!isWithinCwd(normalizeCwd(event.cwd), normalizeCwd(flow.cwd))) return false;
  return eventMatches(flow.hookTrigger, event);
}

function debounceKey(flow, event) {
  return [
    flow.id,
    event.type,
    event.provider || ANY_PROVIDER,
    normalizeCwd(event.cwd) || '',
  ].join('|');
}

module.exports = {
  ANY_PROVIDER,
  normalizePath,
  normalizeCwd,
  globToRegex,
  isHookFlow,
  flowMatchesHookEvent,
  debounceKey,
};
