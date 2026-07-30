import { describe, expect, it, vi } from 'vitest';

const PtyManager = require('../../main/pty-manager');

describe('PtyManager', () => {
  describe('_getChildPids', () => {
    it('returns an empty list when pgrep finds no child process', async () => {
      const manager = new PtyManager({ platform: 'darwin' });
      manager._exec = vi.fn().mockRejectedValue(Object.assign(new Error('Command failed: pgrep -P 1234'), {
        code: 1,
      }));

      await expect(manager._getChildPids(1234)).resolves.toEqual([]);
      expect(manager._exec).toHaveBeenCalledWith('pgrep', ['-P', '1234']);
    });

    it('rethrows pgrep errors that are not the no-match exit code', async () => {
      const manager = new PtyManager({ platform: 'darwin' });
      const error = Object.assign(new Error('pgrep failed'), { code: 2 });
      manager._exec = vi.fn().mockRejectedValue(error);

      await expect(manager._getChildPids(1234)).rejects.toBe(error);
    });

    it('uses the Windows process list instead of pgrep on Windows', async () => {
      const getDirectChildProcesses = vi.fn().mockResolvedValue([
        { pid: 222, ppid: 1234, command: 'codex exec task' },
      ]);
      const manager = new PtyManager({ platform: 'win32', getDirectChildProcesses });
      manager._exec = vi.fn();

      await expect(manager._getChildPids(1234)).resolves.toEqual(['222']);
      expect(getDirectChildProcesses).toHaveBeenCalledWith(1234, { platform: 'win32' });
      expect(manager._exec).not.toHaveBeenCalled();
    });

    it('matches Windows child commands for terminal agent status', async () => {
      const manager = new PtyManager({
        platform: 'win32',
        getDirectChildProcesses: vi.fn().mockResolvedValue([
          { pid: 222, ppid: 1234, command: 'node C:\\bin\\codex exec task' },
        ]),
      });

      await expect(manager._checkAgent('term-1', { pid: 1234 })).resolves.toBe('Codex');
    });
  });

  describe('getCwd ssh detection', () => {
    it('returns a remote ssh URI when the terminal shell has an ssh child', async () => {
      const manager = new PtyManager({
        platform: 'darwin',
        getDirectChildProcesses: vi.fn().mockResolvedValue([
          { pid: 222, ppid: 1234, command: 'ssh sfpl' },
        ]),
        readProcessCwd: vi.fn().mockResolvedValue('/Users/local/project'),
        resolveSshPwd: vi.fn().mockResolvedValue('/home/jeremy'),
      });
      manager.processes.set('term-1', { pid: 1234 });

      await expect(manager.getCwd('term-1')).resolves.toBe('ssh://sfpl/home/jeremy');
    });

    it('falls back to the local cwd when there is no ssh child', async () => {
      const manager = new PtyManager({
        platform: 'darwin',
        getDirectChildProcesses: vi.fn().mockResolvedValue([]),
        readProcessCwd: vi.fn().mockResolvedValue('/Users/local/project'),
        resolveSshPwd: vi.fn(),
      });
      manager.processes.set('term-1', { pid: 1234 });

      await expect(manager.getCwd('term-1')).resolves.toBe('/Users/local/project');
    });
  });
});
