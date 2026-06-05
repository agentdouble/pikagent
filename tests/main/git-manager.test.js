import { afterEach, describe, expect, it, vi } from 'vitest';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { branch, isRepo } = require('../../main/git-manager');

const tempDirs = [];

function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pickagent-nonrepo-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('git-manager', () => {
  it('returns no branch for non-git directories without warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(branch(makeTempDir())).resolves.toBe(null);

    expect(warn).not.toHaveBeenCalled();
  });

  it('returns false for non-git directories without warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(isRepo(makeTempDir())).resolves.toBe(false);

    expect(warn).not.toHaveBeenCalled();
  });
});
