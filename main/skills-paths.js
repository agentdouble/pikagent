const os = require('os');
const path = require('path');

const SKILL_ID_SEPARATOR = '::';

function getDefaultSkillRoots(homeDir = os.homedir()) {
  return [
    path.join(homeDir, '.codex', 'skills'),
    path.join(homeDir, '.claude', 'skills'),
    path.join(homeDir, '.opencode', 'skills'),
  ];
}

function normalizeRoots(roots) {
  return [...new Set((roots || [])
    .map((root) => String(root || '').trim())
    .filter(Boolean)
    .map((root) => path.resolve(root)))];
}

function normalizeSkillSettings(settings, homeDir = os.homedir()) {
  const rootCandidates = Array.isArray(settings?.roots)
    ? settings.roots
    : Array.isArray(settings?.rootPaths)
      ? settings.rootPaths
      : settings?.root
        ? [settings.root]
        : getDefaultSkillRoots(homeDir);
  const roots = normalizeRoots(rootCandidates);
  const fallbackRoots = roots.length ? roots : normalizeRoots(getDefaultSkillRoots(homeDir));
  const rawActive = settings?.activeRoot || settings?.root || fallbackRoots[0];
  const activeRoot = normalizeRoots([rawActive])[0];
  return {
    roots: fallbackRoots,
    activeRoot: fallbackRoots.includes(activeRoot) ? activeRoot : fallbackRoots[0],
  };
}

function buildSkillListId(root, skillName) {
  return `${encodeURIComponent(path.resolve(root))}${SKILL_ID_SEPARATOR}${encodeURIComponent(skillName)}`;
}

function parseSkillListId(id) {
  const text = String(id || '');
  const index = text.indexOf(SKILL_ID_SEPARATOR);
  if (index === -1) return null;
  const root = decodeURIComponent(text.slice(0, index));
  const skillName = decodeURIComponent(text.slice(index + SKILL_ID_SEPARATOR.length));
  if (!root || !skillName) return null;
  return { root, skillName };
}

function rootSourceLabel(root) {
  const resolved = path.resolve(root);
  const base = path.basename(resolved);
  const parent = path.basename(path.dirname(resolved));
  return parent && base === 'skills' ? parent : base;
}

module.exports = {
  SKILL_ID_SEPARATOR,
  getDefaultSkillRoots,
  normalizeRoots,
  normalizeSkillSettings,
  buildSkillListId,
  parseSkillListId,
  rootSourceLabel,
};
