import { describe, expect, it } from 'vitest';

const {
  buildSshPath,
  formatSshPath,
  getSshBaseName,
  joinSshPath,
  parseSshPath,
} = require('../../main/ssh-path-utils');

describe('ssh-path-utils', () => {
  it('builds and parses ssh paths', () => {
    const uri = buildSshPath('user@sfpl', '/home/jeremy/project');

    expect(uri).toBe('ssh://user%40sfpl/home/jeremy/project');
    expect(parseSshPath(uri)).toEqual({
      destination: 'user@sfpl',
      path: '/home/jeremy/project',
    });
  });

  it('joins child paths under a remote root', () => {
    expect(joinSshPath('ssh://sfpl/home/jeremy', 'src')).toBe('ssh://sfpl/home/jeremy/src');
    expect(joinSshPath('ssh://sfpl/', 'src')).toBe('ssh://sfpl/src');
  });

  it('formats remote paths for display', () => {
    expect(formatSshPath('ssh://sfpl/home/jeremy')).toBe('sfpl:/home/jeremy');
    expect(getSshBaseName('ssh://sfpl/')).toBe('sfpl');
  });
});
