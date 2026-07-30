const SSH_PATH_PREFIX = 'ssh://';

function isSshPath(value) {
  return typeof value === 'string' && value.startsWith(SSH_PATH_PREFIX);
}

function normalizeRemotePath(remotePath) {
  if (!remotePath || remotePath === '~') return '/';
  const value = String(remotePath).replace(/\\/g, '/');
  return value.startsWith('/') ? value : `/${value}`;
}

function buildSshPath(destination, remotePath = '/') {
  if (!destination) throw new Error('SSH destination is required');
  return `${SSH_PATH_PREFIX}${encodeURIComponent(destination)}${normalizeRemotePath(remotePath)}`;
}

function parseSshPath(value) {
  if (!isSshPath(value)) return null;
  const rest = value.slice(SSH_PATH_PREFIX.length);
  const slashIndex = rest.indexOf('/');
  const rawDestination = slashIndex === -1 ? rest : rest.slice(0, slashIndex);
  if (!rawDestination) return null;
  const destination = decodeURIComponent(rawDestination);
  const remotePath = normalizeRemotePath(slashIndex === -1 ? '/' : rest.slice(slashIndex));
  return { destination, path: remotePath };
}

function joinRemotePath(basePath, name) {
  const cleanName = String(name || '').replace(/^\/+/, '');
  if (!cleanName) return normalizeRemotePath(basePath);
  const base = normalizeRemotePath(basePath).replace(/\/+$/, '');
  return `${base || ''}/${cleanName}` || '/';
}

function joinSshPath(baseSshPath, name) {
  const parsed = parseSshPath(baseSshPath);
  if (!parsed) return `${baseSshPath.replace(/\/+$/, '')}/${name}`;
  return buildSshPath(parsed.destination, joinRemotePath(parsed.path, name));
}

function getSshBaseName(value) {
  const parsed = parseSshPath(value);
  if (!parsed) return '';
  if (parsed.path === '/') return parsed.destination;
  return parsed.path.split('/').filter(Boolean).pop() || parsed.destination;
}

function getSshParentPath(value) {
  const parsed = parseSshPath(value);
  if (!parsed) return null;
  const parts = parsed.path.split('/').filter(Boolean);
  parts.pop();
  return buildSshPath(parsed.destination, parts.length ? `/${parts.join('/')}` : '/');
}

function formatSshPath(value) {
  const parsed = parseSshPath(value);
  if (!parsed) return String(value || '');
  return `${parsed.destination}:${parsed.path}`;
}

module.exports = {
  SSH_PATH_PREFIX,
  isSshPath,
  normalizeRemotePath,
  buildSshPath,
  parseSshPath,
  joinRemotePath,
  joinSshPath,
  getSshBaseName,
  getSshParentPath,
  formatSshPath,
};
