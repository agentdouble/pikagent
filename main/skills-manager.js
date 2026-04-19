const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { BASE_DIR } = require('./paths');
const { readJson, writeJson, ensureDirOnce } = require('./fs-utils');
const { createLogger, trySafe } = require('./logger');

const log = createLogger('skills-manager');

const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const SETTINGS_FILE = path.join(BASE_DIR, 'skills-settings.json');
const ensureBaseDir = ensureDirOnce(BASE_DIR);

let _rootCache = null;

function parseFrontmatter(md) {
  if (!md.startsWith('---')) return {};
  const end = md.indexOf('\n---', 3);
  if (end === -1) return {};
  const block = md.slice(3, end).trim();
  const out = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([^:]+):\s*(.*)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  }
  return out;
}

async function _loadRoot() {
  if (_rootCache) return _rootCache;
  const settings = await readJson(SETTINGS_FILE);
  _rootCache = (settings && settings.root) ? settings.root : DEFAULT_SKILLS_DIR;
  return _rootCache;
}

async function _saveRoot(newRoot) {
  await ensureBaseDir();
  await writeJson(SETTINGS_FILE, { root: newRoot });
  _rootCache = newRoot;
}

async function _readSkillDir(rootDir, skillName) {
  const dir = path.join(rootDir, skillName);
  const skillPath = path.join(dir, 'SKILL.md');
  return trySafe(async () => {
    const stat = await fsp.stat(skillPath);
    if (!stat.isFile()) return null;
    const raw = await fsp.readFile(skillPath, 'utf-8');
    const meta = parseFrontmatter(raw);
    return {
      id: skillName,
      name: meta.name || skillName,
      description: meta.description || '',
      dir,
      path: skillPath,
      source: 'user',
    };
  }, null, { log, label: 'readSkillDir' });
}

async function list() {
  const root = await _loadRoot();
  return trySafe(async () => {
    const entries = await fsp.readdir(root, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const skills = await Promise.all(dirs.map((name) => _readSkillDir(root, name)));
    return skills.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }, [], { log, label: 'list' });
}

async function read(filePath) {
  if (!(await _isAllowedPath(filePath))) return null;
  return trySafe(
    () => fsp.readFile(filePath, 'utf-8'),
    null,
    { log, label: 'read' },
  );
}

async function write({ filePath, content }) {
  if (!(await _isAllowedPath(filePath))) return { success: false, error: 'Path not allowed' };
  return trySafe(async () => {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content, 'utf-8');
    return { success: true };
  }, { success: false }, { log, label: 'write' });
}

async function create({ id, description }) {
  const safeId = String(id || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!safeId) return { success: false, error: 'Invalid id' };
  const root = await _loadRoot();
  const dir = path.join(root, safeId);
  const filePath = path.join(dir, 'SKILL.md');
  return trySafe(async () => {
    await fsp.mkdir(dir, { recursive: true });
    try {
      await fsp.access(filePath);
      return { success: false, error: 'Skill already exists' };
    } catch {}
    const desc = (description || '').replace(/\n/g, ' ').trim();
    const body = `---\nname: ${safeId}\ndescription: ${desc}\n---\n\n# ${safeId}\n\nDécris ici ce que fait ce skill.\n`;
    await fsp.writeFile(filePath, body, 'utf-8');
    return { success: true, id: safeId, path: filePath };
  }, { success: false }, { log, label: 'create' });
}

async function remove(id) {
  const safeId = String(id || '').trim();
  if (!safeId) return false;
  const root = await _loadRoot();
  const dir = path.join(root, safeId);
  if (!(await _isAllowedPath(dir))) return false;
  return trySafe(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
    return true;
  }, false, { log, label: 'remove' });
}

async function importFrom(srcDir) {
  if (!srcDir) return { success: false, error: 'No source folder' };
  return trySafe(async () => {
    const stat = await fsp.stat(srcDir);
    if (!stat.isDirectory()) return { success: false, error: 'Not a directory' };
    const skillFile = path.join(srcDir, 'SKILL.md');
    try {
      await fsp.access(skillFile);
    } catch {
      return { success: false, error: 'No SKILL.md found in folder' };
    }
    const root = await _loadRoot();
    await fsp.mkdir(root, { recursive: true });
    const baseName = path.basename(srcDir);
    let destName = baseName;
    let destDir = path.join(root, destName);
    let i = 1;
    while (await _exists(destDir)) {
      destName = `${baseName}-${i++}`;
      destDir = path.join(root, destName);
    }
    await _copyRecursive(srcDir, destDir);
    return { success: true, id: destName, path: path.join(destDir, 'SKILL.md') };
  }, { success: false, error: 'Import failed' }, { log, label: 'importFrom' });
}

async function getRoot() {
  return _loadRoot();
}

async function setRoot(newRoot) {
  if (!newRoot) return { success: false, error: 'Empty path' };
  const resolved = path.resolve(newRoot);
  return trySafe(async () => {
    await fsp.mkdir(resolved, { recursive: true });
    await _saveRoot(resolved);
    return { success: true, root: resolved };
  }, { success: false, error: 'Could not set path' }, { log, label: 'setRoot' });
}

async function resetRoot() {
  return trySafe(async () => {
    await fsp.unlink(SETTINGS_FILE).catch(() => {});
    _rootCache = null;
    const root = await _loadRoot();
    return { success: true, root };
  }, { success: false }, { log, label: 'resetRoot' });
}

async function _isAllowedPath(p) {
  if (!p) return false;
  const root = path.resolve(await _loadRoot());
  const resolved = path.resolve(p);
  return resolved === root || resolved.startsWith(root + path.sep);
}

async function _exists(p) {
  try { await fsp.access(p); return true; } catch { return false; }
}

async function _copyRecursive(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) await _copyRecursive(srcPath, destPath);
    else if (entry.isFile()) await fsp.copyFile(srcPath, destPath);
  }
}

module.exports = {
  list, read, write, create, remove, importFrom,
  getRoot, setRoot, resetRoot,
  // Channel-suffix aliases
  delete: remove,
  import: importFrom,
};
