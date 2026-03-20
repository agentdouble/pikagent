const { execFileSync } = require('child_process');

const execOpts = (cwd, extra) => ({
  cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...extra,
});

function getBranch(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], execOpts(cwd)).trim();
  } catch {
    return null;
  }
}

function getRemoteUrl(cwd) {
  try {
    return execFileSync('git', ['config', '--get', 'remote.origin.url'], execOpts(cwd)).trim();
  } catch {
    return null;
  }
}

function getLocalChanges(cwd) {
  try {
    // Staged files
    const stagedRaw = execFileSync('git', ['diff', '--cached', '--name-status'], execOpts(cwd)).trim();
    const staged = stagedRaw ? stagedRaw.split('\n').map((line) => {
      const [status, ...p] = line.split('\t');
      return { status, path: p.join('\t'), staged: true };
    }) : [];

    // Unstaged modified/deleted files
    const unstagedRaw = execFileSync('git', ['diff', '--name-status'], execOpts(cwd)).trim();
    const unstaged = unstagedRaw ? unstagedRaw.split('\n').map((line) => {
      const [status, ...p] = line.split('\t');
      return { status, path: p.join('\t'), staged: false };
    }) : [];

    // Untracked files
    const untrackedRaw = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], execOpts(cwd)).trim();
    const untracked = untrackedRaw ? untrackedRaw.split('\n').map((p) => {
      return { status: '?', path: p, staged: false };
    }) : [];

    return { staged, unstaged, untracked };
  } catch {
    return { staged: [], unstaged: [], untracked: [] };
  }
}

function getFileDiff(cwd, filePath, isStaged) {
  try {
    const args = ['diff'];
    if (isStaged) args.push('--cached');
    args.push('--', filePath);
    return execFileSync('git', args, execOpts(cwd, { maxBuffer: 5 * 1024 * 1024 }));
  } catch {
    return '';
  }
}

module.exports = { getBranch, getRemoteUrl, getLocalChanges, getFileDiff };
