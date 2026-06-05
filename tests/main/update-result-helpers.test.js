import { describe, it, expect } from 'vitest';

const {
  buildAvailableResult,
  buildNotAvailableResult,
  buildUpdateInfo,
  normalizeReleaseNotes,
  toErrorMessage,
} = require('../../main/update-result-helpers');

function makeApp(overrides = {}) {
  return {
    isPackaged: true,
    getVersion: () => '1.0.0',
    ...overrides,
  };
}

describe('update-result-helpers', () => {
  it('builds release update info for the Settings UI', () => {
    const info = buildUpdateInfo(makeApp(), {
      updateDownloaded: true,
      updateInfo: { version: '1.0.1' },
    });

    expect(info).toMatchObject({
      strategy: 'release-artifacts',
      provider: 'github',
      providerLabel: 'GitHub Releases',
      repository: 'agentdouble/pikagent',
      channel: 'latest',
      currentVersion: '1.0.0',
      packaged: true,
      updateDownloaded: true,
      updateVersion: '1.0.1',
      requiresRestart: true,
    });
  });

  it('normalizes string and object release notes', () => {
    expect(normalizeReleaseNotes([
      ' First note ',
      { note: 'Second note' },
      null,
    ])).toEqual(['First note', 'Second note']);
  });

  it('builds available result with version and release notes', () => {
    const info = buildUpdateInfo(makeApp());
    const result = buildAvailableResult({
      version: '1.0.2',
      releaseName: 'Pickagent 1.0.2',
      releaseDate: '2026-06-05T20:00:00.000Z',
      releaseNotes: [{ note: 'Fix updater' }],
    }, info);

    expect(result.available).toBe(true);
    expect(result.version).toBe('1.0.2');
    expect(result.commits).toEqual(['Version 1.0.2', 'Pickagent 1.0.2', 'Fix updater']);
    expect(result.count).toBe(3);
    expect(result.info).toBe(info);
  });

  it('builds not available result', () => {
    const info = buildUpdateInfo(makeApp({ isPackaged: false }));
    expect(buildNotAvailableResult(info)).toEqual({
      available: false,
      commits: [],
      count: 0,
      info,
    });
  });

  it('formats update errors safely', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
    expect(toErrorMessage('raw')).toBe('raw');
    expect(toErrorMessage(null)).toBe('Unknown update error');
  });
});
