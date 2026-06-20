import { describe, it, expect } from 'vitest';
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const {
  PICKAGENT_SKILL_CONTENT,
  ensurePickagentSkill,
  getDefaultPickagentSkillRoots,
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
});
