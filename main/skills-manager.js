const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { createLogger, trySafe } = require('./logger');

const log = createLogger('skills-manager');

const USER_SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills');

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
  return trySafe(async () => {
    const entries = await fsp.readdir(USER_SKILLS_DIR, { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    const skills = await Promise.all(dirs.map((name) => _readSkillDir(USER_SKILLS_DIR, name)));
    return skills.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }, [], { log, label: 'list' });
}

async function read(filePath) {
  if (!_isAllowedPath(filePath)) return null;
  return trySafe(
    () => fsp.readFile(filePath, 'utf-8'),
    null,
    { log, label: 'read' },
  );
}

async function write({ filePath, content }) {
  if (!_isAllowedPath(filePath)) return { success: false, error: 'Path not allowed' };
  return trySafe(async () => {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    await fsp.writeFile(filePath, content, 'utf-8');
    return { success: true };
  }, { success: false }, { log, label: 'write' });
}

async function create({ id, description }) {
  const safeId = String(id || '').trim().replace(/[^a-zA-Z0-9._-]/g, '-');
  if (!safeId) return { success: false, error: 'Invalid id' };
  const dir = path.join(USER_SKILLS_DIR, safeId);
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
  const dir = path.join(USER_SKILLS_DIR, safeId);
  if (!_isAllowedPath(dir)) return false;
  return trySafe(async () => {
    await fsp.rm(dir, { recursive: true, force: true });
    return true;
  }, false, { log, label: 'remove' });
}

function getRoot() {
  return USER_SKILLS_DIR;
}

function _isAllowedPath(p) {
  if (!p) return false;
  const resolved = path.resolve(p);
  const root = path.resolve(USER_SKILLS_DIR) + path.sep;
  return resolved === path.resolve(USER_SKILLS_DIR) || resolved.startsWith(root);
}

module.exports = { list, read, write, create, remove, getRoot };
