const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const execOpts = (cwd, extra) => ({
  cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], ...extra,
});

async function getBranch(cwd) {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], execOpts(cwd));
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getRemoteUrl(cwd) {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], execOpts(cwd));
    return stdout.trim();
  } catch {
    return null;
  }
}

async function getLocalChanges(cwd) {
  try {
    const [stagedResult, unstagedResult, untrackedResult] = await Promise.all([
      execFileAsync('git', ['diff', '--cached', '--name-status'], execOpts(cwd)),
      execFileAsync('git', ['diff', '--name-status'], execOpts(cwd)),
      execFileAsync('git', ['ls-files', '--others', '--exclude-standard'], execOpts(cwd)),
    ]);

    const stagedRaw = stagedResult.stdout.trim();
    const staged = stagedRaw ? stagedRaw.split('\n').map((line) => {
      const [status, ...p] = line.split('\t');
      return { status, path: p.join('\t'), staged: true };
    }) : [];

    const unstagedRaw = unstagedResult.stdout.trim();
    const unstaged = unstagedRaw ? unstagedRaw.split('\n').map((line) => {
      const [status, ...p] = line.split('\t');
      return { status, path: p.join('\t'), staged: false };
    }) : [];

    const untrackedRaw = untrackedResult.stdout.trim();
    const untracked = untrackedRaw ? untrackedRaw.split('\n').map((p) => {
      return { status: '?', path: p, staged: false };
    }) : [];

    return { staged, unstaged, untracked };
  } catch {
    return { staged: [], unstaged: [], untracked: [] };
  }
}

async function getFileDiff(cwd, filePath, isStaged) {
  try {
    const args = ['diff'];
    if (isStaged) args.push('--cached');
    args.push('--', filePath);
    const { stdout } = await execFileAsync('git', args, execOpts(cwd, { maxBuffer: 5 * 1024 * 1024 }));
    return stdout;
  } catch {
    return '';
  }
}

module.exports = { getBranch, getRemoteUrl, getLocalChanges, getFileDiff };
