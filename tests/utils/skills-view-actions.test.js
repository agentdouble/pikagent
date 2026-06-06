import { describe, expect, it, vi } from 'vitest';
import { configurePath } from '../../src/utils/skills-view-actions.js';

function makeSkillsViewState() {
  return {
    rootPath: '/old/skills',
    selectedId: 'skill-1',
    editorDirty: true,
    refresh: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDeps(overrides = {}) {
  return {
    dialogApi: { openFolder: vi.fn().mockResolvedValue('/picked/skills') },
    skillsApi: { setRoot: vi.fn().mockResolvedValue({ success: true, root: '/new/skills' }) },
    chooseRootPathMode: vi.fn().mockResolvedValue('browse'),
    promptPath: vi.fn().mockResolvedValue('/typed/skills'),
    ...overrides,
  };
}

describe('skills-view-actions configurePath', () => {
  it('sets the skills root from the folder picker when browse is selected', async () => {
    const sv = makeSkillsViewState();
    const deps = makeDeps();

    await configurePath(sv, deps);

    expect(deps.dialogApi.openFolder).toHaveBeenCalled();
    expect(deps.promptPath).not.toHaveBeenCalled();
    expect(deps.skillsApi.setRoot).toHaveBeenCalledWith('/picked/skills');
    expect(sv.rootPath).toBe('/new/skills');
    expect(sv.selectedId).toBe(null);
    expect(sv.editorDirty).toBe(false);
    expect(sv.refresh).toHaveBeenCalled();
  });

  it('sets the skills root from a manually entered path when manual is selected', async () => {
    const sv = makeSkillsViewState();
    const deps = makeDeps({
      chooseRootPathMode: vi.fn().mockResolvedValue('manual'),
    });

    await configurePath(sv, deps);

    expect(deps.dialogApi.openFolder).not.toHaveBeenCalled();
    expect(deps.promptPath).toHaveBeenCalledWith('/old/skills');
    expect(deps.skillsApi.setRoot).toHaveBeenCalledWith('/typed/skills');
    expect(sv.rootPath).toBe('/new/skills');
  });

  it('does nothing when the configuration mode dialog is cancelled', async () => {
    const sv = makeSkillsViewState();
    const deps = makeDeps({
      chooseRootPathMode: vi.fn().mockResolvedValue(null),
    });

    await configurePath(sv, deps);

    expect(deps.dialogApi.openFolder).not.toHaveBeenCalled();
    expect(deps.promptPath).not.toHaveBeenCalled();
    expect(deps.skillsApi.setRoot).not.toHaveBeenCalled();
    expect(sv.refresh).not.toHaveBeenCalled();
  });

  it('does nothing when the manual path prompt is empty or cancelled', async () => {
    const sv = makeSkillsViewState();
    const deps = makeDeps({
      chooseRootPathMode: vi.fn().mockResolvedValue('manual'),
      promptPath: vi.fn().mockResolvedValue(null),
    });

    await configurePath(sv, deps);

    expect(deps.skillsApi.setRoot).not.toHaveBeenCalled();
    expect(sv.refresh).not.toHaveBeenCalled();
  });
});
