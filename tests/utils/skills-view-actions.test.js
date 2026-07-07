import { describe, expect, it, vi } from 'vitest';
import { configurePath } from '../../src/utils/skills-view-actions.js';

function makeSkillsViewState() {
  return {
    rootPath: '/old/skills',
    rootPaths: ['/old/skills'],
    activeRootPath: '/old/skills',
    selectedId: 'skill-1',
    editorDirty: true,
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(overrides = {}) {
  return {
    dialogApi: { openFolder: vi.fn().mockResolvedValue('/picked/skills') },
    skillsApi: {
      addRoot: vi.fn().mockResolvedValue({ success: true, roots: ['/old/skills', '/picked/skills'], activeRoot: '/picked/skills' }),
      setRoots: vi.fn().mockResolvedValue({ success: true, roots: ['/new/skills', '/typed/skills'], activeRoot: '/new/skills' }),
    },
    chooseRootPathMode: vi.fn().mockResolvedValue('browse'),
    promptPaths: vi.fn().mockResolvedValue(['/new/skills', '/typed/skills']),
    ...overrides,
  };
}

describe('skills-view-actions configurePath', () => {
  it('adds a skills root from the folder picker when browse is selected', async () => {
    const sv = makeSkillsViewState();
    const deps = makeDeps();

    await configurePath(sv, deps);

    expect(deps.dialogApi.openFolder).toHaveBeenCalled();
    expect(deps.promptPaths).not.toHaveBeenCalled();
    expect(deps.skillsApi.addRoot).toHaveBeenCalledWith('/picked/skills');
    expect(sv.rootPaths).toEqual(['/old/skills', '/picked/skills']);
    expect(sv.rootPath).toBe('/picked/skills');
    expect(sv.selectedId).toBe(null);
    expect(sv.editorDirty).toBe(false);
    expect(sv.refresh).toHaveBeenCalled();
  });

  it('sets the skills roots from manually entered paths when manual is selected', async () => {
    const sv = makeSkillsViewState();
    const deps = makeDeps({
      chooseRootPathMode: vi.fn().mockResolvedValue('manual'),
    });

    await configurePath(sv, deps);

    expect(deps.dialogApi.openFolder).not.toHaveBeenCalled();
    expect(deps.promptPaths).toHaveBeenCalledWith(['/old/skills']);
    expect(deps.skillsApi.setRoots).toHaveBeenCalledWith({
      roots: ['/new/skills', '/typed/skills'],
      activeRoot: '/new/skills',
    });
    expect(sv.rootPath).toBe('/new/skills');
  });

  it('does nothing when the configuration mode dialog is cancelled', async () => {
    const sv = makeSkillsViewState();
    const deps = makeDeps({
      chooseRootPathMode: vi.fn().mockResolvedValue(null),
    });

    await configurePath(sv, deps);

    expect(deps.dialogApi.openFolder).not.toHaveBeenCalled();
    expect(deps.promptPaths).not.toHaveBeenCalled();
    expect(deps.skillsApi.setRoots).not.toHaveBeenCalled();
    expect(deps.skillsApi.addRoot).not.toHaveBeenCalled();
    expect(sv.refresh).not.toHaveBeenCalled();
  });

  it('does nothing when the manual path prompt is empty or cancelled', async () => {
    const sv = makeSkillsViewState();
    const deps = makeDeps({
      chooseRootPathMode: vi.fn().mockResolvedValue('manual'),
      promptPaths: vi.fn().mockResolvedValue(null),
    });

    await configurePath(sv, deps);

    expect(deps.skillsApi.setRoots).not.toHaveBeenCalled();
    expect(sv.refresh).not.toHaveBeenCalled();
  });
});
