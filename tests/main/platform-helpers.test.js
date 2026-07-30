import { describe, expect, it } from 'vitest';

const {
  buildEnvWithPath,
  buildPathEnv,
  buildShellInputLine,
  buildShellSpawn,
  getDefaultShell,
  shellQuote,
  shouldDetachChild,
} = require('../../main/platform-helpers');

describe('platform-helpers', () => {
  it('uses PowerShell defaults on Windows', () => {
    expect(getDefaultShell({ platform: 'win32', env: {} })).toBe('powershell.exe');
    expect(shouldDetachChild('win32')).toBe(false);
  });

  it('quotes shell strings for POSIX and PowerShell', () => {
    expect(shellQuote("it's ok", 'darwin')).toBe("'it'\\''s ok'");
    expect(shellQuote("it's ok", 'win32')).toBe("'it''s ok'");
  });

  it('builds shell input lines with platform-specific line endings', () => {
    expect(buildShellInputLine('npm test', 'darwin')).toBe('npm test; exit\n');
    expect(buildShellInputLine('npm test', 'win32')).toBe('npm test; exit\r\n');
  });

  it('runs non-PTY commands through PowerShell on Windows', () => {
    const spawn = buildShellSpawn('npm test', {
      cwd: 'C:/repo',
      stdio: 'pipe',
      detached: true,
    }, {
      platform: 'win32',
      env: {},
    });

    expect(spawn.command).toBe('powershell.exe');
    expect(spawn.args).toContain('-Command');
    expect(spawn.args.at(-1)).toBe('npm test');
    expect(spawn.options).toMatchObject({
      shell: false,
      detached: false,
      windowsHide: true,
      cwd: 'C:/repo',
    });
  });

  it('keeps POSIX command strings shell-backed', () => {
    const spawn = buildShellSpawn('npm test', { detached: true }, { platform: 'darwin', env: {} });

    expect(spawn).toMatchObject({
      command: 'npm test',
      args: [],
      options: {
        shell: true,
        detached: true,
      },
    });
  });

  it('uses Windows path delimiter when building Windows PATH values', () => {
    expect(buildPathEnv({
      platform: 'win32',
      env: { Path: 'C:\\Windows\\System32' },
      homeDir: 'C:\\Users\\Jeremy',
    })).toContain(';C:\\Windows\\System32');
  });

  it('sets Path instead of PATH for Windows child environments', () => {
    const env = buildEnvWithPath({
      platform: 'win32',
      env: { PATH: '/posix', Path: 'C:\\Windows\\System32' },
      homeDir: 'C:\\Users\\Jeremy',
    });

    expect(env.PATH).toBeUndefined();
    expect(env.Path).toContain('C:\\Windows\\System32');
  });
});
