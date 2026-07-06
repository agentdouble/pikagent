const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const PICKAGENT_SKILL_ID = 'pickagent';
const SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID = 'software-engineering-daily-report';
const SKILL_FILE = 'SKILL.md';
const BUNDLED_SKILLS_DIR = path.join(__dirname, 'bundled-skills');
const LEGACY_PICKAGENT_PLACEHOLDER_CONTENT = `---
name: pickagent
description: Use when working with the Pickagent app, repository, or workflows.
---

*
`;

const BUNDLED_SKILLS = [
  {
    id: PICKAGENT_SKILL_ID,
    sourceDir: path.join(BUNDLED_SKILLS_DIR, PICKAGENT_SKILL_ID),
  },
  {
    id: SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID,
    sourceDir: path.join(BUNDLED_SKILLS_DIR, SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID),
  },
];

const PICKAGENT_SKILL_CONTENT = fs.readFileSync(
  path.join(BUNDLED_SKILLS_DIR, PICKAGENT_SKILL_ID, SKILL_FILE),
  'utf-8',
);

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

function getBundledSkill(skillId) {
  const skill = BUNDLED_SKILLS.find((candidate) => candidate.id === skillId);
  if (!skill) throw new Error(`Unknown bundled skill: ${skillId}`);
  return skill;
}

async function listBundledFiles(dir, prefix = '') {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(prefix, entry.name);
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listBundledFiles(fullPath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

function isLegacyPickagentPlaceholder(content) {
  return String(content || '').replace(/\r\n/g, '\n').trim()
    === LEGACY_PICKAGENT_PLACEHOLDER_CONTENT.trim();
}

function shouldUpdateExistingBundledFile(skillId, relativePath, content) {
  return skillId === PICKAGENT_SKILL_ID
    && relativePath === SKILL_FILE
    && isLegacyPickagentPlaceholder(content);
}

async function writeBundledFile(sourcePath, targetPath, options = {}) {
  const content = await fsp.readFile(sourcePath);
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fsp.writeFile(targetPath, content, { flag: 'wx' });
    return { created: true, updated: false };
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      if (options.shouldUpdateExisting) {
        const existing = await fsp.readFile(targetPath, 'utf-8');
        if (options.shouldUpdateExisting(existing)) {
          await fsp.writeFile(targetPath, content);
          return { created: false, updated: true };
        }
      }
      return { created: false, updated: false };
    }
    throw err;
  }
}

async function ensureBundledSkill(rootDir, skillId) {
  const skill = getBundledSkill(skillId);
  const root = path.resolve(rootDir);
  const dir = path.join(root, skill.id);
  const filePath = path.join(dir, SKILL_FILE);
  const bundledFiles = await listBundledFiles(skill.sourceDir);
  const files = [];
  let skipCompanionFiles = false;

  await fsp.mkdir(dir, { recursive: true });
  if (skill.id === PICKAGENT_SKILL_ID) {
    try {
      const existingSkill = await fsp.readFile(filePath, 'utf-8');
      skipCompanionFiles = !isLegacyPickagentPlaceholder(existingSkill);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
  }

  for (const relativePath of bundledFiles) {
    const targetPath = path.join(dir, relativePath);
    const sourcePath = path.join(skill.sourceDir, relativePath);
    if (skipCompanionFiles && relativePath !== SKILL_FILE) {
      files.push({ path: targetPath, relativePath, created: false, updated: false, skipped: true });
      continue;
    }
    const result = await writeBundledFile(sourcePath, targetPath, {
      shouldUpdateExisting: (content) => shouldUpdateExistingBundledFile(
        skill.id,
        relativePath,
        content,
      ),
    });
    files.push({ path: targetPath, relativePath, ...result });
  }

  return {
    success: true,
    created: files.some((file) => file.created),
    updated: files.some((file) => file.updated),
    changed: files.some((file) => file.created || file.updated),
    skillId: skill.id,
    root,
    dir,
    path: filePath,
    files,
  };
}

async function ensurePickagentSkill(rootDir) {
  return ensureBundledSkill(rootDir, PICKAGENT_SKILL_ID);
}

async function installBundledSkills({ roots, homeDir, skillIds } = {}) {
  const targetRoots = normalizeRoots(roots || getDefaultPickagentSkillRoots(homeDir));
  const targetSkillIds = skillIds || BUNDLED_SKILLS.map((skill) => skill.id);
  const targets = [];

  for (const root of targetRoots) {
    for (const skillId of targetSkillIds) {
      try {
        targets.push(await ensureBundledSkill(root, skillId));
      } catch (err) {
        targets.push({
          success: false,
          created: false,
          skillId,
          root,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    success: targets.length > 0 && targets.every((target) => target.success),
    targets,
  };
}

async function installPickagentSkill(options = {}) {
  return installBundledSkills({ ...options, skillIds: [PICKAGENT_SKILL_ID] });
}

module.exports = {
  BUNDLED_SKILLS,
  BUNDLED_SKILLS_DIR,
  LEGACY_PICKAGENT_PLACEHOLDER_CONTENT,
  PICKAGENT_SKILL_CONTENT,
  PICKAGENT_SKILL_ID,
  SKILL_FILE,
  SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID,
  ensureBundledSkill,
  ensurePickagentSkill,
  getDefaultPickagentSkillRoots,
  installBundledSkills,
  installPickagentSkill,
  normalizeRoots,
};
