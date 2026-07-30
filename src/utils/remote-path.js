const SSH_PATH_PREFIX = 'ssh://';

export function isSshPath(value) {
  return typeof value === 'string' && value.startsWith(SSH_PATH_PREFIX);
}

function normalizeRemotePath(remotePath) {
  if (!remotePath || remotePath === '~') return '/';
  const value = String(remotePath).replace(/\\/g, '/');
  return value.startsWith('/') ? value : `/${value}`;
}

export function parseSshPath(value) {
  if (!isSshPath(value)) return null;
  const rest = value.slice(SSH_PATH_PREFIX.length);
  const slashIndex = rest.indexOf('/');
  const rawDestination = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
  if (!rawDestination) return null;
  return {
    destination: decodeURIComponent(rawDestination),
    path: normalizeRemotePath(slashIndex === -1 ? '/' : rest.slice(slashIndex)),
  };
}

export function joinTreePath(basePath, name) {
  const cleanName = String(name || '').replace(/^\/+/, '');
  if (!cleanName) return basePath;
  if (!isSshPath(basePath)) return `${basePath.replace(/\/+$/, '')}/${cleanName}`;
  const parsed = parseSshPath(basePath);
  if (!parsed) return `${basePath.replace(/\/+$/, '')}/${cleanName}`;
  const base = parsed.path.replace(/\/+$/, '');
  return `ssh://${encodeURIComponent(parsed.destination)}${base || ''}/${cleanName}`;
}

export function getTreeBaseName(value) {
  const parsed = parseSshPath(value);
  if (!parsed) return String(value || '').split('/').filter(Boolean).pop() || '/';
  if (parsed.path === '/') return parsed.destination;
  return parsed.path.split('/').filter(Boolean).pop() || parsed.destination;
}

export function formatTreePath(value) {
  const parsed = parseSshPath(value);
  if (!parsed) return String(value || '');
  return `${parsed.destination}:${parsed.path}`;
}
