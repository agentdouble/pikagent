import { describe, expect, it } from 'vitest';
import {
  formatTreePath,
  getTreeBaseName,
  isSshPath,
  joinTreePath,
  parseSshPath,
} from '../../src/utils/remote-path.js';

describe('remote-path', () => {
  it('recognizes and parses ssh paths', () => {
    expect(isSshPath('ssh://sfpl/home/me')).toBe(true);
    expect(parseSshPath('ssh://sfpl/home/me')).toEqual({
      destination: 'sfpl',
      path: '/home/me',
    });
  });

  it('joins local and remote paths', () => {
    expect(joinTreePath('/tmp/demo', 'file.txt')).toBe('/tmp/demo/file.txt');
    expect(joinTreePath('ssh://sfpl/home/me', 'file.txt')).toBe('ssh://sfpl/home/me/file.txt');
  });

  it('formats remote labels', () => {
    expect(getTreeBaseName('ssh://sfpl/')).toBe('sfpl');
    expect(formatTreePath('ssh://sfpl/home/me')).toBe('sfpl:/home/me');
  });
});
