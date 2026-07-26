import { describe, expect, it, vi } from 'vitest';
const os = require('os');
const path = require('path');
const {
  APP_NAME,
  USER_DATA_ENV,
  configureAppIdentity,
  getDevUserDataDir,
  sanitizePathSegment,
} = require('../../main/app-identity');

function createAppMock({ isPackaged = false, appData = '/Users/test/Library/Application Support' } = {}) {
  return {
    isPackaged,
    getPath: vi.fn((key) => {
      if (key === 'appData') return appData;
      throw new Error(`Unexpected path key: ${key}`);
    }),
    setName: vi.fn(),
    setPath: vi.fn(),
  };
}

describe('app-identity', () => {
  it('sanitizes checkout names for profile paths', () => {
    expect(sanitizePathSegment('2 pikagent copy')).toBe('2-pikagent-copy');
    expect(sanitizePathSegment('')).toBe('workspace');
  });

  it('builds a checkout-scoped dev userData path', () => {
    expect(getDevUserDataDir('/Users/test/Library/Application Support', '/repo/2-pikagent-copy'))
      .toBe(path.join('/Users/test/Library/Application Support', 'Pickagent Dev', '2-pikagent-copy'));
  });

  it('sets the app name and isolates userData in dev', () => {
    const app = createAppMock();
    const userDataDir = configureAppIdentity(app, '/repo/2-pikagent-copy', {});

    expect(app.setName).toHaveBeenCalledWith(APP_NAME);
    expect(app.setPath).toHaveBeenCalledWith('userData', userDataDir);
    expect(userDataDir).toBe(path.join('/Users/test/Library/Application Support', 'Pickagent Dev', '2-pikagent-copy'));
  });

  it('keeps packaged apps on the default Electron userData path', () => {
    const app = createAppMock({ isPackaged: true });

    expect(configureAppIdentity(app, '/repo/2-pikagent-copy', {})).toBe(null);
    expect(app.setName).toHaveBeenCalledWith(APP_NAME);
    expect(app.setPath).not.toHaveBeenCalled();
  });

  it('allows an explicit userData override', () => {
    const app = createAppMock({ isPackaged: true });
    const override = path.join(os.tmpdir(), 'pickagent-dev-profile');

    expect(configureAppIdentity(app, '/repo/2-pikagent-copy', { [USER_DATA_ENV]: override })).toBe(override);
    expect(app.setPath).toHaveBeenCalledWith('userData', override);
  });
});
