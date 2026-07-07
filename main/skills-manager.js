const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { BASE_DIR } = require('./paths');
const { ensureDirOnce, listDirNames } = require('./fs-utils');
const { createManagerSafe } = require('./logger');
const { pathExists } = require('./fs-manager-helpers');
const { JsonStore } = require('./json-store');
const { CachedJsonFile } = require('./cached-json-file');
const { sanitizeSegment } = require('../shared/string-utils');
const { installBundledSkills: installBundledSkillFiles } = require('./skill-install-helpers');
const {
  buildSkillListId,
  getDefaultSkillRoots,
  normalizeRoots,
  normalizeSkillSettings,
  parseSkillListId,
  rootSourceLabel,
} = require('./skills-paths');

const store = new JsonStore(BASE_DIR, 'skills-manager');
const log = store.log;

const DEFAULT_SKILLS_DIRS = getDefaultSkillRoots(os.homedir());
const SETTINGS_FILE = path.join(BASE_DIR, 'skills-settings.json');

const _metaFile = new CachedJsonFile(SETTINGS_FILE, () => store.ensureDir(), null);
const _ensureRootDirs = new Map();

const _managerSafe = createManagerSafe(log, 'skills-manager');

/**
 * Higher-order function that wraps `fn` with the manager-level safe handler.
 * Returns a new function with the same signature that catches errors
 * and returns `fallback` instead, logging via the module logger.
 *
 * @template T
 * @template {unknown[]} A
 * @param {(...args: A) => Promise<T>} fn   - named async function to wrap
 * @param {T} fallback                       - value returned on error
 * @returns {(...args: A) => Promise<T>}    - wrapped function
 */
const _safe = (fn, fallback) => (...args) =>
  _managerSafe(() => fn(...args), fallback);

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

function _ensureRootDir(root) {
  const resolved = path.resolve(root);
  if (!_ensureRootDirs.has(resolved)) _ensureRootDirs.set(resolved, ensureDirOnce(resolved));
  return _ensureRootDirs.get(resolved);
}

async function _loadSettings() {
  const settings = await _metaFile.read();
  return normalizeSkillSettings(settings, os.homedir());
}

async function _saveSettings(nextSettings) {
  const roots = normalizeRoots(nextSettings.roots);
  const activeCandidate = normalizeRoots([nextSettings.activeRoot])[0];
  const activeRoot = roots.includes(activeCandidate) ? activeCandidate : roots[0];
  await _metaFile.write({ roots, activeRoot });
}

const _readSkillDir = _safe(async function readSkillDir(rootDir, skillName) {
  const dir = path.join(rootDir, skillName);
  const skillPath = path.join(dir, 'SKILL.md');
  const stat = await fsp.stat(skillPath);
  if (!stat.isFile()) return null;
  const raw = await fsp.readFile(skillPath, 'utf-8');
  const meta = parseFrontmatter(raw);
  return {
    id: buildSkillListId(rootDir, skillName),
    skillId: skillName,
    name: meta.name || skillName,
    description: meta.description || '',
    root: path.resolve(rootDir),
    dir,
    path: skillPath,
    source: rootSourceLabel(rootDir),
  };
}, null);

async function _listRoot(root) {
  try {
    const dirs = await listDirNames(root);
    const skills = await Promise.all(dirs.map((name) => _readSkillDir(root, name)));
    return skills.filter(Boolean);
  } catch {
    return [];
  }
}

const list = _safe(async function list() {
  const { roots } = await _loadSettings();
  const skills = (await Promise.all(roots.map((root) => _listRoot(root)))).flat();
  return skills.sort((a, b) =>
    a.name.localeCompare(b.name) || a.source.localeCompare(b.source) || a.path.localeCompare(b.path),
  );
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
  const { activeRoot: root } = await _loadSettings();
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
  return { success: true, id: buildSkillListId(root, safeId), skillId: safeId, path: filePath };
}, { success: false });

const remove = _safe(async function remove(id) {
  const parsed = parseSkillListId(id);
  const { activeRoot } = await _loadSettings();
  const safeId = parsed?.skillName || String(id || '').trim();
  if (!safeId) return false;
  const root = parsed?.root || activeRoot;
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
  const { activeRoot: root } = await _loadSettings();
  await _ensureRootDir(root)();
  const baseName = path.basename(srcDir);
  let destName = baseName;
  let destDir = path.join(root, destName);
  let i = 1;
  while (await pathExists(destDir)) {
    destName = `${baseName}-${i++}`;
    destDir = path.join(root, destName);
  }
  await fsp.cp(srcDir, destDir, { recursive: true });
  return { success: true, id: buildSkillListId(root, destName), skillId: destName, path: path.join(destDir, 'SKILL.md') };
}, { success: false, error: 'Import failed' });

const getRoot = _safe(async function getRoot() {
  const { activeRoot } = await _loadSettings();
  return activeRoot;
}, null);

const getRoots = _safe(async function getRoots() {
  return _loadSettings();
}, { roots: DEFAULT_SKILLS_DIRS, activeRoot: DEFAULT_SKILLS_DIRS[0] });

const setRoot = _safe(async function setRoot(newRoot) {
  if (!newRoot) return { success: false, error: 'Empty path' };
  const resolved = path.resolve(newRoot);
  await fsp.mkdir(resolved, { recursive: true });
  await _saveSettings({ roots: [resolved], activeRoot: resolved });
  return { success: true, root: resolved };
}, { success: false, error: 'Could not set path' });

const setRoots = _safe(async function setRoots(input) {
  const rootsInput = Array.isArray(input) ? input : input?.roots;
  const roots = normalizeRoots(rootsInput);
  if (!roots.length) return { success: false, error: 'At least one path is required' };
  const activeInput = Array.isArray(input) ? roots[0] : input?.activeRoot;
  const activeCandidate = normalizeRoots([activeInput])[0];
  const activeRoot = roots.includes(activeCandidate) ? activeCandidate : roots[0];
  await Promise.all(roots.map((root) => fsp.mkdir(root, { recursive: true })));
  await _saveSettings({ roots, activeRoot });
  return { success: true, roots, activeRoot, root: activeRoot };
}, { success: false, error: 'Could not set paths' });

const addRoot = _safe(async function addRoot(newRoot) {
  if (!newRoot) return { success: false, error: 'Empty path' };
  const { roots } = await _loadSettings();
  const resolved = path.resolve(newRoot);
  const nextRoots = normalizeRoots([...roots, resolved]);
  await fsp.mkdir(resolved, { recursive: true });
  await _saveSettings({ roots: nextRoots, activeRoot: resolved });
  return { success: true, roots: nextRoots, activeRoot: resolved, root: resolved };
}, { success: false, error: 'Could not add path' });

const removeRoot = _safe(async function removeRoot(rootToRemove) {
  const { roots, activeRoot } = await _loadSettings();
  const resolved = normalizeRoots([rootToRemove])[0];
  const nextRoots = roots.filter((root) => root !== resolved);
  if (!resolved || nextRoots.length === roots.length) {
    return { success: false, error: 'Path not configured' };
  }
  if (!nextRoots.length) return { success: false, error: 'At least one path is required' };
  const nextActive = activeRoot === resolved ? nextRoots[0] : activeRoot;
  await _saveSettings({ roots: nextRoots, activeRoot: nextActive });
  return { success: true, roots: nextRoots, activeRoot: nextActive, root: nextActive };
}, { success: false, error: 'Could not remove path' });

const setActiveRoot = _safe(async function setActiveRoot(root) {
  const { roots } = await _loadSettings();
  const resolved = normalizeRoots([root])[0];
  if (!roots.includes(resolved)) return { success: false, error: 'Path is not configured' };
  await _saveSettings({ roots, activeRoot: resolved });
  return { success: true, roots, activeRoot: resolved, root: resolved };
}, { success: false, error: 'Could not set active path' });

const resetRoot = _safe(async function resetRoot() {
  await fsp.unlink(SETTINGS_FILE).catch(() => {});
  _metaFile.invalidate();
  const { roots, activeRoot } = await _loadSettings();
  return { success: true, root: activeRoot, roots, activeRoot };
}, { success: false });

const installPickagentSkill = _safe(async function installPickagentSkill() {
  return installBundledSkillFiles({ skillIds: ['pickagent'] });
}, { success: false, targets: [] });

const installBundledSkills = _safe(async function installBundledSkills() {
  return installBundledSkillFiles();
}, { success: false, targets: [] });

async function _isAllowedPath(p) {
  if (!p) return false;
  const { roots } = await _loadSettings();
  const resolved = path.resolve(p);
  return roots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + path.sep);
  });
}

module.exports = {
  list, read, write, create,
  getRoot, getRoots, setRoot, setRoots, addRoot, removeRoot, setActiveRoot, resetRoot,
  installBundledSkills,
  installPickagentSkill,
  // `delete` and `import` are reserved words — aliases required.
  delete: remove,
  import: importFrom,
};
