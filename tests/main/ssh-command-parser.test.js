import { describe, expect, it } from 'vitest';

const { parseSshCommand, splitCommandLine } = require('../../main/ssh-command-parser');

describe('ssh-command-parser', () => {
  it('splits quoted command lines', () => {
    expect(splitCommandLine('ssh -i "my key.pem" user@host')).toEqual([
      'ssh',
      '-i',
      'my key.pem',
      'user@host',
    ]);
  });

  it('extracts a simple ssh destination', () => {
    expect(parseSshCommand('ssh sfpl')).toMatchObject({ destination: 'sfpl' });
  });

  it('skips options with separate values', () => {
    expect(parseSshCommand('/usr/bin/ssh -i ~/.ssh/id -p 2222 user@example.com')).toMatchObject({
      destination: 'user@example.com',
    });
  });

  it('skips attached options', () => {
    expect(parseSshCommand('ssh -p2222 -oBatchMode=yes sfpl')).toMatchObject({
      destination: 'sfpl',
    });
  });

  it('returns null for non-ssh commands', () => {
    expect(parseSshCommand('node /usr/bin/codex exec')).toBe(null);
  });
});
