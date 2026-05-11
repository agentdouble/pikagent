import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/utils/dom-dialogs.js', () => ({
  showErrorAlert: vi.fn(),
}));

import { gitFlowStep } from '../../src/utils/git-flow-helpers.js';
import { showErrorAlert } from '../../src/utils/dom-dialogs.js';

describe('gitFlowStep', () => {
  it('returns the result when apiCall succeeds', async () => {
    const apiCall = vi.fn().mockResolvedValue({ ok: true, data: 42 });
    const result = await gitFlowStep(apiCall, 'Test failed: ');
    expect(result).toEqual({ ok: true, data: 42 });
    expect(apiCall).toHaveBeenCalledOnce();
    expect(showErrorAlert).not.toHaveBeenCalled();
  });

  it('returns null and shows error alert when result.ok is false', async () => {
    const apiCall = vi.fn().mockResolvedValue({ ok: false, error: 'branch conflict' });
    const result = await gitFlowStep(apiCall, 'Push failed: ');
    expect(result).toBeNull();
    expect(showErrorAlert).toHaveBeenCalledWith('Push failed: ', 'branch conflict');
  });

  it('returns null and shows error alert when result is null', async () => {
    const apiCall = vi.fn().mockResolvedValue(null);
    const result = await gitFlowStep(apiCall, 'Unexpected: ');
    expect(result).toBeNull();
    expect(showErrorAlert).toHaveBeenCalledWith('Unexpected: ', undefined);
  });

  it('returns null and shows error alert when result is undefined', async () => {
    const apiCall = vi.fn().mockResolvedValue(undefined);
    const result = await gitFlowStep(apiCall, 'No result: ');
    expect(result).toBeNull();
    expect(showErrorAlert).toHaveBeenCalledWith('No result: ', undefined);
  });

  it('returns null when result.ok is falsy (e.g. 0)', async () => {
    const apiCall = vi.fn().mockResolvedValue({ ok: 0, error: 'zero' });
    const result = await gitFlowStep(apiCall, 'Zero: ');
    expect(result).toBeNull();
    expect(showErrorAlert).toHaveBeenCalledWith('Zero: ', 'zero');
  });

  it('propagates errors thrown by apiCall', async () => {
    const apiCall = vi.fn().mockRejectedValue(new Error('network down'));
    await expect(gitFlowStep(apiCall, 'Crash: ')).rejects.toThrow('network down');
  });
});
