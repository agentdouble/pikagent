const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { BASE_DIR } = require('./paths');
const { readJson, writeJson, ensureDirOnce, listDirNames } = require('./fs-utils');
const { trySafe } = require('./logger');
const { pathExists } = require('./fs-manager-helpers');
const { JsonStore } = require('./json-store');
const { sanitizeSegment } = require('../shared/string-utils');

const store = new JsonStore(BASE_DIR, 'skills-manager');
const log = store.log;

const DEFAULT_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');
const SETTINGS_FILE = path.join(BASE_DIR, 'skills-settings.json');

let _rootCache = null;
let _ensureRootDir = ensureDirOnce(DEFAULT_SKILLS_DIR);

/**
 * Higher-order function that wraps `fn` with trySafe.
 * Returns a new function with the same signature that catches errors
 * and returns `fallback` instead, logging via the module logger.
 *
 * @template T
 * @template {any[]} A
 * @param {(...args: A) => Promise<T>} fn   - named async function to wrap
 * @param {T} fallback                       - value returned on error
 * @returns {(...args: A) => Promise<T>}    - wrapped function
 */
const _safe = (fn, fallback) => (...args) =>
  trySafe(() => fn(...args), fallback, { log, label: fn.name || 'skills-op' });

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
  await store.ensureDir();
  await writeJson(SETTINGS_FILE, { root: newRoot });
  _rootCache = newRoot;
  _ensureRootDir = ensureDirOnce(newRoot);
}

const _readSkillDir = _safe(async function readSkillDir(rootDir, skillName) {
  const dir = path.join(rootDir, skillName);
  const skillPath = path.join(dir, 'SKILL.md');
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
}, null);

const list = _safe(async function list() {
  const root = await _loadRoot();
  const dirs = await listDirNames(root);
  const skills = await Promise.all(dirs.map((name) => _readSkillDir(root, name)));
  return skills.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}, []);

const read = _safe(async function read(filePath) {
  if (!(await _isAllowedPath(filePath))) return null;
  return fsp.readFile(filePath, 'utf-8');
}, null);

const write = _safe(async function write({ filePath, content }) {
  if (!(await _isAllowedPath(filePath))) return { success: false, error: 'Path not allowed' };
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf-8');
  return { success: true };
}, { success: false });

const create = _safe(async function create({ id, description }) {
  const safeId = sanitizeSegment(String(id || '').trim());
  if (!safeId) return { success: false, error: 'Invalid id' };
  const root = await _loadRoot();
  const dir = path.join(root, safeId);
  const filePath = path.join(dir, 'SKILL.md');
  await fsp.mkdir(dir, { recursive: true });
  try {
    await fsp.access(filePath);
    return { success: false, error: 'Skill already exists' };
  } catch {}
  const desc = (description || '').replace(/\n/g, ' ').trim();
  const body = `---\nname: ${safeId}\ndescription: ${desc}\n---\n\n# ${safeId}\n\nDécris ici ce que fait ce skill.\n`;
  await fsp.writeFile(filePath, body, 'utf-8');
  return { success: true, id: safeId, path: filePath };
}, { success: false });

const remove = _safe(async function remove(id) {
  const safeId = String(id || '').trim();
  if (!safeId) return false;
  const root = await _loadRoot();
  const dir = path.join(root, safeId);
  if (!(await _isAllowedPath(dir))) return false;
  await fsp.rm(dir, { recursive: true, force: true });
  return true;
}, false);

const importFrom = _safe(async function importFrom(srcDir) {
  if (!srcDir) return { success: false, error: 'No source folder' };
  const stat = await fsp.stat(srcDir);
  if (!stat.isDirectory()) return { success: false, error: 'Not a directory' };
  const skillFile = path.join(srcDir, 'SKILL.md');
  try {
    await fsp.access(skillFile);
  } catch {
    return { success: false, error: 'No SKILL.md found in folder' };
  }
  const root = await _loadRoot();
  await _ensureRootDir();
  const baseName = path.basename(srcDir);
  let destName = baseName;
  let destDir = path.join(root, destName);
  let i = 1;
  while (await pathExists(destDir)) {
    destName = `${baseName}-${i++}`;
    destDir = path.join(root, destName);
  }
  await fsp.cp(srcDir, destDir, { recursive: true });
  return { success: true, id: destName, path: path.join(destDir, 'SKILL.md') };
}, { success: false, error: 'Import failed' });

const getRoot = _safe(async function getRoot() {
  return _loadRoot();
}, null);

const setRoot = _safe(async function setRoot(newRoot) {
  if (!newRoot) return { success: false, error: 'Empty path' };
  const resolved = path.resolve(newRoot);
  await fsp.mkdir(resolved, { recursive: true });
  await _saveRoot(resolved);
  return { success: true, root: resolved };
}, { success: false, error: 'Could not set path' });

const resetRoot = _safe(async function resetRoot() {
  await fsp.unlink(SETTINGS_FILE).catch(() => {});
  _rootCache = null;
  _ensureRootDir = ensureDirOnce(DEFAULT_SKILLS_DIR);
  const root = await _loadRoot();
  return { success: true, root };
}, { success: false });

async function _isAllowedPath(p) {
  if (!p) return false;
  const root = path.resolve(await _loadRoot());
  const resolved = path.resolve(p);
  return resolved === root || resolved.startsWith(root + path.sep);
}

module.exports = {
  list, read, write, create,
  getRoot, setRoot, resetRoot,
  // `delete` and `import` are reserved words — aliases required.
  delete: remove,
  import: importFrom,
};
