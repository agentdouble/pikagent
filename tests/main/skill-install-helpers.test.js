import { describe, it, expect } from 'vitest';
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  PICKAGENT_SKILL_CONTENT,
  SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID,
  ensureBundledSkill,
  ensurePickagentSkill,
  getDefaultPickagentSkillRoots,
  installBundledSkills,
  installPickagentSkill,
} = require('../../main/skill-install-helpers');

async function makeTempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'pickagent-skill-'));
}

describe('skill-install-helpers', () => {
  it('targets Codex and Claude skills roots under the provided home dir', () => {
    const roots = getDefaultPickagentSkillRoots('/tmp/home');
    expect(roots).toEqual([
      '/tmp/home/.codex/skills',
      '/tmp/home/.claude/skills',
    ]);
  });

  it('creates the pickagent skill placeholder in a root', async () => {
    const root = await makeTempDir();
    const result = await ensurePickagentSkill(root);
    const content = await fsp.readFile(result.path, 'utf-8');

    expect(result).toMatchObject({ success: true, created: true });
    expect(result.path).toBe(path.join(root, 'pickagent', 'SKILL.md'));
    expect(content).toBe(PICKAGENT_SKILL_CONTENT);
    expect(content.trim().endsWith('*')).toBe(true);
  });

  it('does not overwrite an existing pickagent skill', async () => {
    const root = await makeTempDir();
    const skillPath = path.join(root, 'pickagent', 'SKILL.md');
    await fsp.mkdir(path.dirname(skillPath), { recursive: true });
    await fsp.writeFile(skillPath, 'custom content', 'utf-8');

    const result = await ensurePickagentSkill(root);
    const content = await fsp.readFile(skillPath, 'utf-8');

    expect(result).toMatchObject({ success: true, created: false });
    expect(content).toBe('custom content');
  });

  it('installs the placeholder once per unique root', async () => {
    const root = await makeTempDir();
    const result = await installPickagentSkill({ roots: [root, root] });

    expect(result.success).toBe(true);
    expect(result.targets).toHaveLength(1);
    expect(await fsp.readFile(path.join(root, 'pickagent', 'SKILL.md'), 'utf-8'))
      .toBe(PICKAGENT_SKILL_CONTENT);
  });

  it('installs bundled skills with their resource files', async () => {
    const root = await makeTempDir();
    const result = await ensureBundledSkill(root, SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID);

    expect(result).toMatchObject({
      success: true,
      created: true,
      skillId: SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID,
    });
    expect(await fsp.readFile(path.join(root, SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID, 'SKILL.md'), 'utf-8'))
      .toContain('Report what the local software engineering pipeline did today');
    expect(await fsp.readFile(path.join(root, SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID, 'agents', 'openai.yaml'), 'utf-8'))
      .toContain('$software-engineering-daily-report');
    expect(await fsp.readFile(path.join(root, SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID, 'scripts', 'software_engineering_daily_report.rb'), 'utf-8'))
      .toContain('Bilan software engineering');
  });

  it('installs every bundled skill into every unique root', async () => {
    const root = await makeTempDir();
    const result = await installBundledSkills({ roots: [root, root] });

    expect(result.success).toBe(true);
    expect(result.targets.map((target) => target.skillId).sort()).toEqual([
      'pickagent',
      SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID,
    ].sort());
    expect(await fsp.readFile(path.join(root, 'pickagent', 'SKILL.md'), 'utf-8'))
      .toBe(PICKAGENT_SKILL_CONTENT);
    expect(await fsp.readFile(path.join(root, SOFTWARE_ENGINEERING_DAILY_REPORT_SKILL_ID, 'SKILL.md'), 'utf-8'))
      .toContain('software engineering pipeline');
  });
});
