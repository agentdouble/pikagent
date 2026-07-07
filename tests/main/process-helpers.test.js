import { describe, expect, it, vi } from 'vitest';

const {
  getDirectChildProcesses,
  parsePosixPsOutput,
  parseWindowsProcessList,
  terminateProcessTree,
} = require('../../main/process-helpers');

describe('process-helpers', () => {
  it('parses POSIX ps rows with command and start date', () => {
    const rows = parsePosixPsOutput([
      '  123   1 Sat Jun 20 10:11:12 2026 codex exec --cwd /repo',
      'bad line',
    ].join('\n'));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      pid: 123,
      ppid: 1,
      command: 'codex exec --cwd /repo',
    });
    expect(rows[0].startedAt).toContain('2026');
  });

  it('parses Windows process JSON from PowerShell', () => {
    const rows = parseWindowsProcessList(JSON.stringify([
      {
        pid: 100,
        ppid: 42,
        startedAt: '2026-07-07T10:00:00.0000000Z',
        command: 'codex exec --cwd C:\\repo',
      },
      {
        pid: 'bad',
        ppid: 42,
        command: 'ignore me',
      },
    ]));

    expect(rows).toEqual([{
      pid: 100,
      ppid: 42,
      startedAt: '2026-07-07T10:00:00.000Z',
      command: 'codex exec --cwd C:\\repo',
    }]);
  });

  it('filters direct child processes from the platform process list', async () => {
    const execFile = vi.fn().mockResolvedValue({
      stdout: JSON.stringify([
        { pid: 2, ppid: 1, command: 'child' },
        { pid: 3, ppid: 2, command: 'grandchild' },
      ]),
    });

    await expect(getDirectChildProcesses(1, { platform: 'win32', execFile })).resolves.toEqual([
      { pid: 2, ppid: 1, startedAt: undefined, command: 'child' },
    ]);
  });

  it('uses taskkill for Windows process-tree termination', async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: '' });

    await expect(terminateProcessTree(123, { platform: 'win32', execFile })).resolves.toBeNull();
    expect(execFile).toHaveBeenCalledWith('taskkill', ['/PID', '123', '/T', '/F'], expect.objectContaining({
      windowsHide: true,
    }));
  });
});
