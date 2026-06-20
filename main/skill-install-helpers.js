const fsp = require('fs/promises');
const os = require('os');
const path = require('path');

const PICKAGENT_SKILL_ID = 'pickagent';
const PICKAGENT_SKILL_FILE = 'SKILL.md';
const PICKAGENT_SKILL_CONTENT = `---
name: pickagent
description: Use when working with the Pickagent app, repository, or workflows.
---

*
`;

function getDefaultPickagentSkillRoots(homeDir = os.homedir()) {
  return [
    path.join(homeDir, '.codex', 'skills'),
    path.join(homeDir, '.claude', 'skills'),
  ];
}

function normalizeRoots(roots) {
  return [...new Set((roots || [])
    .filter(Boolean)
    .map((root) => path.resolve(root)))];
}

async function ensurePickagentSkill(rootDir) {
  const root = path.resolve(rootDir);
  const dir = path.join(root, PICKAGENT_SKILL_ID);
  const filePath = path.join(dir, PICKAGENT_SKILL_FILE);

  await fsp.mkdir(dir, { recursive: true });

  try {
    await fsp.writeFile(filePath, PICKAGENT_SKILL_CONTENT, { encoding: 'utf-8', flag: 'wx' });
    return { success: true, created: true, root, dir, path: filePath };
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      return { success: true, created: false, root, dir, path: filePath };
    }
    throw err;
  }
}

async function installPickagentSkill({ roots, homeDir } = {}) {
  const targetRoots = normalizeRoots(roots || getDefaultPickagentSkillRoots(homeDir));
  const targets = [];

  for (const root of targetRoots) {
    try {
      targets.push(await ensurePickagentSkill(root));
    } catch (err) {
      targets.push({
        success: false,
        created: false,
        root,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    success: targets.length > 0 && targets.every((target) => target.success),
    targets,
  };
}

module.exports = {
  PICKAGENT_SKILL_CONTENT,
  PICKAGENT_SKILL_FILE,
  PICKAGENT_SKILL_ID,
  ensurePickagentSkill,
  getDefaultPickagentSkillRoots,
  installPickagentSkill,
  normalizeRoots,
};
