const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const PICKAGENT_SKILL_ID = 'pickagent';
const SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID = 'software-engineering-daily-report';
const SKILL_FILE = 'SKILL.md';
const BUNDLED_SKILLS_DIR = path.join(__dirname, 'bundled-skills');

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

async function writeBundledFile(sourcePath, targetPath) {
  const content = await fsp.readFile(sourcePath);
  await fsp.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fsp.writeFile(targetPath, content, { flag: 'wx' });
    return true;
  } catch (err) {
    if (err && err.code === 'EEXIST') return false;
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

  await fsp.mkdir(dir, { recursive: true });

  for (const relativePath of bundledFiles) {
    const targetPath = path.join(dir, relativePath);
    const sourcePath = path.join(skill.sourceDir, relativePath);
    const created = await writeBundledFile(sourcePath, targetPath);
    files.push({ path: targetPath, relativePath, created });
  }

  return {
    success: true,
    created: files.some((file) => file.created),
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
