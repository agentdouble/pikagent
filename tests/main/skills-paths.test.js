import { describe, expect, it } from 'vitest';
const path = require('path');
const {
  buildSkillListId,
  getDefaultSkillRoots,
  normalizeSkillSettings,
  parseSkillListId,
  rootSourceLabel,
} = require('../../main/skills-paths');

describe('skills-paths', () => {
  it('includes Codex, Claude, and OpenCode default skill roots', () => {
    expect(getDefaultSkillRoots('/tmp/home')).toEqual([
      path.join('/tmp/home', '.codex', 'skills'),
      path.join('/tmp/home', '.claude', 'skills'),
      path.join('/tmp/home', '.opencode', 'skills'),
    ]);
  });

  it('migrates legacy single-root settings into multi-root settings', () => {
    const settings = normalizeSkillSettings({ root: '/tmp/home/.claude/skills' }, '/tmp/home');

    expect(settings).toEqual({
      roots: [path.resolve('/tmp/home/.claude/skills')],
      activeRoot: path.resolve('/tmp/home/.claude/skills'),
    });
  });

  it('keeps the first configured root active when activeRoot is missing', () => {
    const settings = normalizeSkillSettings({
      roots: ['/tmp/home/.codex/skills', '/tmp/home/.opencode/skills'],
    }, '/tmp/home');

    expect(settings.activeRoot).toBe(path.resolve('/tmp/home/.codex/skills'));
  });

  it('round-trips list ids that include root and skill folder', () => {
    const id = buildSkillListId('/tmp/home/.opencode/skills', 'my-skill');

    expect(parseSkillListId(id)).toEqual({
      root: path.resolve('/tmp/home/.opencode/skills'),
      skillName: 'my-skill',
    });
  });

  it('labels provider roots from their parent directory', () => {
    expect(rootSourceLabel('/tmp/home/.opencode/skills')).toBe('.opencode');
  });
});
