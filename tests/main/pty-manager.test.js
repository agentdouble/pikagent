import { describe, expect, it, vi } from 'vitest';

const PtyManager = require('../../main/pty-manager');

describe('PtyManager', () => {
  describe('getCwd on Windows', () => {
    it('returns the latest cwd reported by the PowerShell prompt hook', async () => {
      const manager = new PtyManager({ platform: 'win32', shell: 'powershell.exe' });
      manager.processes.set('term-1', { pid: 1234 });
      manager.cwdById.set('term-1', 'C:\\Users\\rekta');

      manager._captureCwd('term-1', '\x1b]1337;CurrentDir=C:\\Users\\rekta\\projet\x07');

      await expect(manager.getCwd('term-1')).resolves.toBe('C:\\Users\\rekta\\projet');
    });
  });

  describe('_getChildPids', () => {
    it('returns an empty list when pgrep finds no child process', async () => {
      const manager = new PtyManager();
      manager._exec = vi.fn().mockRejectedValue(Object.assign(new Error('Command failed: pgrep -P 1234'), {
        code: 1,
      }));

      await expect(manager._getChildPids(1234)).resolves.toEqual([]);
      expect(manager._exec).toHaveBeenCalledWith('pgrep', ['-P', '1234']);
    });

    it('rethrows pgrep errors that are not the no-match exit code', async () => {
      const manager = new PtyManager();
      const error = Object.assign(new Error('pgrep failed'), { code: 2 });
      manager._exec = vi.fn().mockRejectedValue(error);

      await expect(manager._getChildPids(1234)).rejects.toBe(error);
    });
  });
});
