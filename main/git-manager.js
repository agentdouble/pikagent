const { execSync, execFileSync } = require('child_process');

function getBranch(cwd) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function getRemoteUrl(cwd) {
  try {
    return execSync('git config --get remote.origin.url', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function getLocalChanges(cwd) {
  try {
    // Staged files
    const stagedRaw = execSync('git diff --cached --name-status', {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const staged = stagedRaw ? stagedRaw.split('\n').map((line) => {
      const [status, ...p] = line.split('\t');
      return { status, path: p.join('\t'), staged: true };
    }) : [];

    // Unstaged modified/deleted files
    const unstagedRaw = execSync('git diff --name-status', {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const unstaged = unstagedRaw ? unstagedRaw.split('\n').map((line) => {
      const [status, ...p] = line.split('\t');
      return { status, path: p.join('\t'), staged: false };
    }) : [];

    // Untracked files
    const untrackedRaw = execSync('git ls-files --others --exclude-standard', {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
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
    const diff = execFileSync('git', args, {
      cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 5 * 1024 * 1024,
    });
    return diff;
  } catch {
    return '';
  }
}

module.exports = { getBranch, getRemoteUrl, getLocalChanges, getFileDiff };
