const { execSync } = require('child_process');

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

function getRecentChanges(cwd, count = 30) {
  try {
    const raw = execSync(
      `git log --pretty=format:"%H||%h||%an||%ar||%s" -n ${count}`,
      { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }
    ).trim();
    if (!raw) return [];
    return raw.split('\n').map((line) => {
      const [hash, shortHash, author, date, ...rest] = line.split('||');
      return { hash, shortHash, author, date, message: rest.join('||') };
    });
  } catch {
    return [];
  }
}

function getCommitDiff(cwd, hash) {
  try {
    const stat = execSync(
      `git diff-tree --no-commit-id -r --name-status ${hash}`,
      { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024 }
    ).trim();
    const files = stat
      ? stat.split('\n').map((line) => {
          const [status, ...pathParts] = line.split('\t');
          return { status, path: pathParts.join('\t') };
        })
      : [];

    const diff = execSync(
      `git show --format="" --patch ${hash}`,
      { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 5 * 1024 * 1024 }
    );

    return { files, diff };
  } catch {
    return { files: [], diff: '' };
  }
}

module.exports = { getBranch, getRemoteUrl, getRecentChanges, getCommitDiff };
