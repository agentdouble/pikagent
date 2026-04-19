import { describe, it, expect } from 'vitest';
import { parseRemoteUrl, buildPrUrl } from '../../src/utils/open-pr-flow.js';

describe('parseRemoteUrl', () => {
  it('parses HTTPS github URLs (with and without .git)', () => {
    expect(parseRemoteUrl('https://github.com/owner/repo.git')).toEqual({
      host: 'github.com', owner: 'owner', repo: 'repo',
    });
    expect(parseRemoteUrl('https://github.com/owner/repo')).toEqual({
      host: 'github.com', owner: 'owner', repo: 'repo',
    });
  });

  it('parses SSH-style github URLs', () => {
    expect(parseRemoteUrl('git@github.com:owner/repo.git')).toEqual({
      host: 'github.com', owner: 'owner', repo: 'repo',
    });
  });

  it('parses ssh:// URLs', () => {
    expect(parseRemoteUrl('ssh://git@github.com/owner/repo.git')).toEqual({
      host: 'github.com', owner: 'owner', repo: 'repo',
    });
  });

  it('parses gitlab and bitbucket URLs', () => {
    expect(parseRemoteUrl('git@gitlab.com:foo/bar.git')).toEqual({
      host: 'gitlab.com', owner: 'foo', repo: 'bar',
    });
    expect(parseRemoteUrl('https://bitbucket.org/foo/bar.git')).toEqual({
      host: 'bitbucket.org', owner: 'foo', repo: 'bar',
    });
  });

  it('returns null for unparseable URLs', () => {
    expect(parseRemoteUrl('')).toBeNull();
    expect(parseRemoteUrl(null)).toBeNull();
    expect(parseRemoteUrl('not a url')).toBeNull();
  });
});

describe('buildPrUrl', () => {
  const gh = { host: 'github.com', owner: 'o', repo: 'r' };

  it('builds github compare URL with base branch', () => {
    expect(buildPrUrl(gh, 'feat/x', 'main'))
      .toBe('https://github.com/o/r/compare/main...feat%2Fx?expand=1');
  });

  it('builds github pull/new URL without base branch', () => {
    expect(buildPrUrl(gh, 'feat/x', null))
      .toBe('https://github.com/o/r/pull/new/feat%2Fx');
  });

  it('builds gitlab merge-request URL', () => {
    const url = buildPrUrl({ host: 'gitlab.com', owner: 'o', repo: 'r' }, 'feat', 'main');
    expect(url).toContain('/-/merge_requests/new?');
    expect(url).toContain('merge_request%5Bsource_branch%5D=feat');
    expect(url).toContain('merge_request%5Btarget_branch%5D=main');
  });

  it('builds bitbucket pull-requests URL', () => {
    const url = buildPrUrl({ host: 'bitbucket.org', owner: 'o', repo: 'r' }, 'feat', 'main');
    expect(url).toContain('/pull-requests/new?source=feat');
    expect(url).toContain('dest=main');
  });

  it('returns null for unknown hosts', () => {
    expect(buildPrUrl({ host: 'gitea.example.com', owner: 'o', repo: 'r' }, 'x', null)).toBeNull();
  });
});
